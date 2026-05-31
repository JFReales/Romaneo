# Deploy en Vercel (frontend + backend)

## 1) Variables de entorno en Vercel

En tu proyecto de Vercel, agregá:

- `DATABASE_URL`: URL de tu Postgres productiva.
- `ALLOWED_ORIGINS`: dominio del frontend, por ejemplo `https://tu-app.vercel.app`.

## 2) Deploy

Subí esta carpeta a un repo Git (sin `venv` ni `frontend/node_modules`) y conectalo en Vercel.

Este proyecto ya incluye:

- `vercel.json` para build de React (Vite) + API Python.
- `api/index.py` para exponer FastAPI como función serverless.
- `requirements.txt` para instalar dependencias del backend.
- `frontend/.env.production` con `VITE_API_URL=/api`.

## 3) Pruebas rápidas

- Frontend: `https://tu-app.vercel.app`
- API healthcheck: `https://tu-app.vercel.app/api/health`
