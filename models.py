from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, UniqueConstraint, DECIMAL
from sqlalchemy.orm import relationship
from database import Base
import datetime

class Tropa(Base):
    __tablename__ = "tropas"
    id = Column(Integer, primary_key=True, index=True)
    numero_tropa = Column(String, nullable=False)
    matadero = Column(String, nullable=False)
    firma = Column(String, nullable=False)
    proveedor_id = Column(Integer, ForeignKey("proveedores.id"), nullable=True) # <--- Apunta a proveedores
    fecha_ingreso = Column(DateTime, default=datetime.datetime.utcnow)
    
    piezas = relationship("Pieza", back_populates="tropa", cascade="all, delete-orphan")
    proveedor = relationship("Proveedor") # <--- Trae el nombre del proveedor

class Pieza(Base):
    __tablename__ = "piezas"
    
    id = Column(Integer, primary_key=True, index=True)
    tropa_id = Column(Integer, ForeignKey("tropas.id"))
    numero_pieza = Column(Integer, nullable=False)
    peso_entrada_kg = Column(DECIMAL(6, 2), nullable=False)
    
    # --- NUEVO: Control de pesaje único de cámara ---
    peso_salida_camara_kg = Column(DECIMAL(6, 2), nullable=True)
    
    # --- Control de la PIERNA ---
    en_stock_pierna = Column(Boolean, default=True)
    destino_pierna = Column(String, nullable=True)
    fecha_salida_pierna = Column(DateTime, nullable=True)
    peso_salida_pierna_kg = Column(DECIMAL(6, 2), nullable=True)
    
    # --- Control de la ESPALDA ---
    en_stock_espalda = Column(Boolean, default=True)
    destino_espalda = Column(String, nullable=True)
    fecha_salida_espalda = Column(DateTime, nullable=True)
    peso_salida_espalda_kg = Column(DECIMAL(6, 2), nullable=True)
    
    tropa = relationship("Tropa", back_populates="piezas")

    __table_args__ = (UniqueConstraint('tropa_id', 'numero_pieza', name='_tropa_pieza_uc'),)

class Cliente(Base):
    __tablename__ = "clientes"
    
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, unique=True, index=True, nullable=False)

class Proveedor(Base):
    __tablename__ = "proveedores"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, unique=True, index=True, nullable=False)