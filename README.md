# PlannerPlatform

PlannerPlatform is a cross-platform planner app with a React Native frontend and a FastAPI backend. It supports authentication, tasks, habits, workspaces, analytics, and Google Calendar integration.

## Features

- Authentication with token-based session storage
- Tasks and habits management
- Workspace-based collaboration and history
- Analytics dashboard
- Google Calendar integration on the backend

## Tech Stack

- Frontend: Expo, React Native, TypeScript, React Navigation, Axios
- Backend: FastAPI, SQLAlchemy, PostgreSQL, Alembic, Pydantic
- Data / ML: pandas, scikit-learn
- Auth / Integrations: JWT, Passlib, Google API client libraries

## Project Structure

- `frontend/` - Expo mobile/web application
- `backend/` - FastAPI API and database models

## Frontend Setup

1. Install dependencies:

   ```bash
   cd frontend
   npm install
   ```

2. Start the Expo app:

   ```bash
   cd frontend
   npx expo start
   ```

Available app screens include:

- Login and registration
- Dashboard / tasks
- Habits
- Analytics
- Workspaces
- Profile
- Workspace details and history

## Backend Setup

1. Install Python dependencies:

   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. Start the API server:

   ```bash
   cd backend
   uvicorn main:app --reload
   ```

The backend exposes the API under `/api/v1` and includes routes for:

- Authentication
- Users
- Tasks
- Habits
- Workspaces
- Analytics

## Notes

- The frontend API client is configured in `frontend/src/api/client.ts`.
- The backend creates and updates tables on startup using SQLAlchemy metadata and schema checks.
- Credentials and tokens are excluded from version control through `.gitignore`.

## Reset Starter Files

If you want to restore the Expo starter layout, run:

```bash
cd frontend
npm run reset-project
```

## Learn More

- [Expo docs](https://docs.expo.dev/)
- [FastAPI docs](https://fastapi.tiangolo.com/)
- [React Navigation docs](https://reactnavigation.org/)