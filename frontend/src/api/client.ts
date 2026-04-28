import axios from 'axios';
import { getToken, deleteToken } from './auth';

const LOCAL_BASE_URL = 'http://192.168.0.108:8000/api/v1';
const PUBLIC_BASE_URL = 'https://jocosely-telekinetic-eleonore.ngrok-free.dev';
const BASE_URL = PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/api/v1` : LOCAL_BASE_URL;

export let globalLogout = () => {
    console.log('Logout function not set yet');
};

export const setGlobalLogout = (fn: () => void) => {
    globalLogout = fn;
};

const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
    },
});

apiClient.interceptors.request.use(
    async (config) => {
        const token = await getToken();
        if (token && token !== 'null' && config.headers) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (error.response && error.response.status === 401) {
            console.warn('Token is invalid, logging out...');
            await deleteToken();
            globalLogout();
        }
        return Promise.reject(error);
    }
);

export default apiClient;
