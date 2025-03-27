import axios from 'axios';

const apiClient = axios.create({
    baseURL: 'http://localhost:5000',
    timeout: 10000,
});

apiClient.interceptors.response.use(
    response => response,
    async error => {
        const originalRequest = error.config;
        if (error.response && error.response.status >= 500) {
            originalRequest.baseURL = 'https://insightface.japaneast.cloudapp.azure.com';
            return apiClient(originalRequest);
        }
        return Promise.reject(error);
    }
);

export default apiClient;
