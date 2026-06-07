import axios from "axios";

// 1. Si está en producción (Vercel), la URL base es simplemente "/api".
// 2. Si estás en tu PC (desarrollo), usa la variable de entorno o el localhost por defecto.
const rawApiUrl = import.meta.env.PROD
  ? "/api"
  : import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const API_URL = rawApiUrl.replace(/\/$/, "");

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export default api;
