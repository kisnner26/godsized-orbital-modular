# GOD-SIZED SPACE SIM FINAL v6

Flujo corregido para la práctica:

1. Inicio con cinemática desde el interior de la cabina.
2. Botón **INICIAR SIMULACIÓN**.
3. Control de la nave Orion-07 completa en tercera persona.
4. Al acercarse al sistema solar, se activa una transición de aproximación lenta.
5. El sistema pregunta qué cuerpo observar: planeta o cometa.
6. En observación se visualiza el movimiento según condiciones iniciales de posición/velocidad, gravitación universal y segunda ley de Newton.
7. Incluye sonido de nave y voz del astronauta en inglés con subtítulos en español.

## Ejecutar

```bash
cd ~/Downloads/godsized-space-sim-final
python3 -m http.server 5173
```

Abrir:

```txt
http://localhost:5173
```

## Controles

- W: avanzar
- S: retroceder
- A: izquierda
- D: derecha
- Space: subir
- Control: bajar
- Shift: boost
- C: condiciones iniciales
- 1: observar planeta
- 2: observar cometa
- Escape: salir de observación


## Cambios v7
- En observación, la nave desaparece y la cámara se centra únicamente en el cuerpo celeste.
- `Escape` o botón `SALIR DE OBSERVACIÓN` restaura la nave completa en tercera persona.
- Corregida la orientación del modelo Orion-07: propulsores atrás, nariz al frente.
- HUD de observación simplificado y centrado para no tapar el cuerpo observado.
