import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Esto busca el archivo .env y carga las variables
load_dotenv()

# Ahora leemos la variable DATABASE_URL que pusiste en el .env
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

# Si por alguna razón no encuentra la variable, tiramos un error claro
if not SQLALCHEMY_DATABASE_URL:
    raise ValueError("No se encontró DATABASE_URL en el archivo .env")

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()