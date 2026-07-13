import datetime

from sqlalchemy import Boolean, Column, DateTime, DECIMAL, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from database import Base


class Tropa(Base):
    __tablename__ = "tropas"

    id = Column(Integer, primary_key=True, index=True)
    numero_tropa = Column(String, nullable=False)
    matadero = Column(String, nullable=False)
    firma = Column(String, nullable=False)
    proveedor_id = Column(Integer, ForeignKey("proveedores.id"), nullable=True)
    fecha_ingreso = Column(DateTime, default=datetime.datetime.utcnow)

    piezas = relationship("Pieza", back_populates="tropa", cascade="all, delete-orphan")
    proveedor = relationship("Proveedor")


class Pieza(Base):
    __tablename__ = "piezas"

    id = Column(Integer, primary_key=True, index=True)
    tropa_id = Column(Integer, ForeignKey("tropas.id"), nullable=False)
    numero_pieza = Column(Integer, nullable=False)
    peso_entrada_kg = Column(DECIMAL(8, 2), nullable=False)
    peso_salida_camara_kg = Column(DECIMAL(8, 2), nullable=True)
    es_toro = Column(Boolean, default=False, nullable=False)
    cerrada = Column(Boolean, default=False, nullable=False)

    # Legacy stock fields are kept so old data and monitor views remain compatible.
    en_stock_pierna = Column(Boolean, default=True)
    destino_pierna = Column(String, nullable=True)
    fecha_salida_pierna = Column(DateTime, nullable=True)
    peso_salida_pierna_kg = Column(DECIMAL(8, 2), nullable=True)

    en_stock_espalda = Column(Boolean, default=True)
    destino_espalda = Column(String, nullable=True)
    fecha_salida_espalda = Column(DateTime, nullable=True)
    peso_salida_espalda_kg = Column(DECIMAL(8, 2), nullable=True)

    tropa = relationship("Tropa", back_populates="piezas")
    salidas = relationship(
        "Salida",
        back_populates="pieza",
        cascade="all, delete-orphan",
        order_by="Salida.fecha_salida",
    )

    __table_args__ = (UniqueConstraint("tropa_id", "numero_pieza", name="_tropa_pieza_uc"),)


class Salida(Base):
    __tablename__ = "salidas"

    id = Column(Integer, primary_key=True, index=True)
    pieza_id = Column(Integer, ForeignKey("piezas.id", ondelete="CASCADE"), nullable=False, index=True)
    tipo = Column(String, nullable=False, index=True)
    peso_kg = Column(DECIMAL(8, 2), nullable=False)
    cliente = Column(String, nullable=False, index=True)
    razon_social_origen = Column(String, nullable=False, index=True)
    razon_social_destino = Column(String, nullable=False, index=True)
    fecha_salida = Column(DateTime, nullable=False, default=datetime.datetime.utcnow, index=True)
    cierra_pieza = Column(Boolean, default=False, nullable=False)
    observaciones = Column(String, nullable=True)
    legacy_clave = Column(String, unique=True, nullable=True)
    creado_en = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    actualizado_en = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    pieza = relationship("Pieza", back_populates="salidas")


class FirmaConsignataria(Base):
    __tablename__ = "firmas_consignatarias"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, unique=True, index=True, nullable=False)
    es_propia = Column(Boolean, default=False, nullable=False)
    creada_en = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class Cliente(Base):
    __tablename__ = "clientes"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, unique=True, index=True, nullable=False)


class Proveedor(Base):
    __tablename__ = "proveedores"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, unique=True, index=True, nullable=False)
