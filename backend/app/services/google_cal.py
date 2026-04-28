import os
import json
from datetime import datetime, timedelta

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from google_auth_oauthlib.flow import Flow
from loguru import logger
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from app.db.models import User

load_dotenv()

CREDENTIALS_PATH = "credentials.json"
SCOPES = ["https://www.googleapis.com/auth/calendar"]

os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

DEFAULT_REDIRECT_URI = "http://127.0.0.1:8000/api/v1/auth/google/callback"

oauth_state_store = {}

DAY_MAPPING = {0: "MO", 1: "TU", 2: "WE", 3: "TH", 4: "FR", 5: "SA", 6: "SU"}
MONTHLY_POSITION_MAPPING = {
    "first": 1,
    "second": 2,
    "third": 3,
    "fourth": 4,
    "last": -1,
}


def get_google_redirect_uri() -> str:
    load_dotenv(override=True)

    public_backend_url = os.getenv("PUBLIC_BACKEND_URL", "").strip().rstrip("/")
    if public_backend_url:
        return f"{public_backend_url}/api/v1/auth/google/callback"

    return DEFAULT_REDIRECT_URI


def get_calendar_service(user_id: str, db: Session):
    user = db.query(User).filter(User.id == user_id).first()

    if not user or not user.google_token:
        return None

    creds = Credentials.from_authorized_user_info(user.google_token, SCOPES)

    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        user.google_token = json.loads(creds.to_json())
        db.commit()

    return build("calendar", "v3", credentials=creds)


def format_datetime_for_gcal(dt: datetime) -> str:
    return dt.isoformat()


def build_habit_recurrence_rule(frequency: str, target_days):
    if frequency == "daily":
        return ["RRULE:FREQ=DAILY"]

    if frequency == "weekly" and isinstance(target_days, list) and target_days:
        days_str = ",".join([DAY_MAPPING[day] for day in target_days if day in DAY_MAPPING])
        return [f"RRULE:FREQ=WEEKLY;BYDAY={days_str}"] if days_str else None

    if frequency == "monthly" and isinstance(target_days, dict):
        weekday = target_days.get("weekday")
        week_of_month = target_days.get("week_of_month")

        if weekday in DAY_MAPPING and week_of_month in MONTHLY_POSITION_MAPPING:
            return [
                f"RRULE:FREQ=MONTHLY;BYDAY={DAY_MAPPING[weekday]};BYSETPOS={MONTHLY_POSITION_MAPPING[week_of_month]}"
            ]

    return None


def generate_google_auth_url(user_id: str) -> str:
    redirect_uri = get_google_redirect_uri()
    flow = Flow.from_client_secrets_file(
        CREDENTIALS_PATH,
        scopes=SCOPES,
        redirect_uri=redirect_uri,
    )

    auth_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )

    oauth_state_store[state] = {
        "user_id": user_id,
        "code_verifier": flow.code_verifier,
    }

    return auth_url


def save_google_token_from_code(code: str, state: str, db: Session):
    stored_data = oauth_state_store.get(state)
    if not stored_data:
        raise Exception("Сесія авторизації застаріла або не знайдена. Спробуйте ще раз.")

    user_id = stored_data["user_id"]
    redirect_uri = get_google_redirect_uri()

    flow = Flow.from_client_secrets_file(
        CREDENTIALS_PATH,
        scopes=SCOPES,
        redirect_uri=redirect_uri,
        state=state,
    )

    flow.code_verifier = stored_data["code_verifier"]
    flow.fetch_token(code=code)

    user = db.query(User).filter(User.id == user_id).first()
    if user:
        user.google_token = json.loads(flow.credentials.to_json())
        db.commit()

    del oauth_state_store[state]
    return True


def add_task_to_calendar(user_id: str, title: str, description: str, due_date: datetime, db: Session) -> str:
    service = get_calendar_service(str(user_id), db)
    if not service or not due_date:
        return None

    end_time = due_date + timedelta(hours=1)
    event = {
        "summary": title,
        "description": description or "",
        "start": {"dateTime": format_datetime_for_gcal(due_date), "timeZone": "Europe/Kyiv"},
        "end": {"dateTime": format_datetime_for_gcal(end_time), "timeZone": "Europe/Kyiv"},
    }

    created_event = service.events().insert(calendarId="primary", body=event).execute()
    return created_event.get("id")


def update_task_in_calendar(user_id: str, event_id: str, title: str, description: str, due_date: datetime, db: Session):
    service = get_calendar_service(str(user_id), db)
    if not service or not event_id or not due_date:
        return

    try:
        event = service.events().get(calendarId="primary", eventId=event_id).execute()
        end_time = due_date + timedelta(hours=1)
        event["summary"] = title
        event["description"] = description or ""
        event["start"] = {"dateTime": format_datetime_for_gcal(due_date), "timeZone": "Europe/Kyiv"}
        event["end"] = {"dateTime": format_datetime_for_gcal(end_time), "timeZone": "Europe/Kyiv"}
        service.events().update(calendarId="primary", eventId=event_id, body=event).execute()
    except Exception as error:
        logger.warning(f"Не вдалося оновити подію {event_id}: {error}")


def delete_event_from_calendar(user_id: str, event_id: str, db: Session):
    service = get_calendar_service(str(user_id), db)
    if not service or not event_id:
        return

    try:
        service.events().delete(calendarId="primary", eventId=event_id).execute()
    except Exception as error:
        logger.warning(f"Не вдалося видалити подію {event_id}: {error}")


def add_habit_to_calendar(user_id: str, title: str, frequency: str, target_days, db: Session) -> str:
    service = get_calendar_service(str(user_id), db)
    if not service:
        return None

    start_date = datetime.now().replace(hour=10, minute=0, second=0, microsecond=0)
    end_time = start_date + timedelta(hours=1)

    event = {
        "summary": f"Звичка: {title}",
        "start": {"dateTime": format_datetime_for_gcal(start_date), "timeZone": "Europe/Kyiv"},
        "end": {"dateTime": format_datetime_for_gcal(end_time), "timeZone": "Europe/Kyiv"},
    }

    recurrence = build_habit_recurrence_rule(frequency, target_days)
    if recurrence:
        event["recurrence"] = recurrence

    try:
        created_event = service.events().insert(calendarId="primary", body=event).execute()
        return created_event.get("id")
    except Exception as error:
        logger.error(f"Помилка створення звички в календарі: {error}")
        return None


def update_habit_in_calendar(user_id: str, event_id: str, title: str, frequency: str, target_days, db: Session):
    service = get_calendar_service(str(user_id), db)
    if not service or not event_id:
        return

    try:
        event = service.events().get(calendarId="primary", eventId=event_id).execute()
        event["summary"] = f"Звичка: {title}"

        recurrence = build_habit_recurrence_rule(frequency, target_days)
        if recurrence:
            event["recurrence"] = recurrence
        elif "recurrence" in event:
            del event["recurrence"]

        service.events().update(calendarId="primary", eventId=event_id, body=event).execute()
    except Exception as error:
        logger.error(f"Помилка оновлення звички в календарі: {error}")
