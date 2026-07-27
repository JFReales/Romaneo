import { useMemo, useRef, useState } from 'react';


const Combobox = ({
  id,
  label,
  value,
  onChange,
  onSelect,
  options,
  placeholder,
  clearLabel,
  emptyMessage = 'Podés usar este nombre nuevo.',
  disabled = false,
}) => {
  const [abierto, setAbierto] = useState(false);
  const [verTodos, setVerTodos] = useState(false);
  const [indiceActivo, setIndiceActivo] = useState(-1);
  const opcionesRef = useRef([]);
  const menuId = `${id}-opciones`;

  const filtrados = useMemo(() => {
    if (verTodos || !value.trim()) return options.slice(0, 100);
    const texto = value.toLocaleLowerCase('es');
    return options
      .filter((item) => item.toLocaleLowerCase('es').includes(texto))
      .slice(0, 100);
  }, [options, value, verTodos]);

  const items = useMemo(() => {
    const resultado = filtrados.map((item) => ({ value: item, label: item }));
    if (clearLabel && (verTodos || !value.trim())) {
      resultado.unshift({ value: '', label: clearLabel });
    }
    return resultado;
  }, [clearLabel, filtrados, value, verTodos]);

  const elegir = (item) => {
    onChange(item.value);
    onSelect?.(item.value);
    setAbierto(false);
    setVerTodos(false);
    setIndiceActivo(-1);
  };

  const moverSeleccion = (direccion) => {
    if (items.length === 0) return;
    const siguiente = indiceActivo < 0
      ? (direccion > 0 ? 0 : items.length - 1)
      : (indiceActivo + direccion + items.length) % items.length;
    setIndiceActivo(siguiente);
    setTimeout(() => opcionesRef.current[siguiente]?.scrollIntoView({ block: 'nearest' }), 0);
  };

  const manejarTeclado = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setAbierto(true);
      moverSeleccion(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }

    if (event.key === 'Enter' && abierto) {
      const exacto = items.find(
        (item) => item.value && item.value.toLocaleLowerCase('es') === value.trim().toLocaleLowerCase('es'),
      );
      const candidato = items[indiceActivo] || exacto || (filtrados.length === 1 ? items.at(-1) : null);
      if (candidato) {
        event.preventDefault();
        elegir(candidato);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setAbierto(false);
      setIndiceActivo(-1);
    }
  };

  return (
    <div className="field-block combo-field" style={{ position: 'relative', marginBottom: 0 }}>
      <label htmlFor={id}>{label}</label>
      <div className="combo-control">
        <input
          id={id}
          role="combobox"
          aria-expanded={abierto}
          aria-controls={menuId}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setVerTodos(false);
            setIndiceActivo(-1);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => {
            setAbierto(false);
            setIndiceActivo(-1);
          }, 120)}
          onKeyDown={manejarTeclado}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="combo-arrow"
          title="Ver todas las opciones"
          aria-label={`Ver opciones de ${label}`}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setVerTodos(true);
            setIndiceActivo(-1);
            setAbierto(true);
          }}
        >
          ▼
        </button>
      </div>

      {abierto && !disabled && (
        <div className="combo-menu" id={menuId} role="listbox">
          {items.length === 0 ? (
            <div className="combo-empty">{emptyMessage}</div>
          ) : items.map((item, index) => (
            <button
              type="button"
              role="option"
              aria-selected={indiceActivo === index}
              ref={(elemento) => { opcionesRef.current[index] = elemento; }}
              key={`${item.value}-${index}`}
              className={`combo-option ${indiceActivo === index ? 'active' : ''}`}
              onMouseEnter={() => setIndiceActivo(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                elegir(item);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};


export default Combobox;
