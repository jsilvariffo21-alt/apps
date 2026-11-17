# MovilTrack — carreras con la mirada

Juego de **entrenamiento visual** para niños y niñas con alteraciones del
neurodesarrollo, pensado especialmente para personas con **control voluntario
de los movimientos oculares** (por ejemplo, con riesgo de síndrome de
enclaustramiento). El vehículo cambia de carril según hacia dónde mira el niño,
usando solo la **cámara frontal** del teléfono o la tablet.

- 🆓 Gratuito y de **código abierto** (licencia MIT).
- 🔒 **Privado:** el video se procesa dentro del dispositivo. No se envía ni se guarda ninguna imagen.
- 📱 Funciona en el navegador (Safari en iPhone/iPad, Chrome en Android y computador). Se puede instalar como app.
- ✈️ Después de la primera carga funciona **sin internet**.

> ⚠️ **No es un dispositivo médico.** Es una herramienta de juego y entrenamiento.
> No reemplaza a un sistema de seguimiento ocular certificado (como Tobii) para
> comunicación aumentativa o evaluación clínica.

## Cómo usarlo en un iPhone

1. Abre en **Safari**: `https://jsilvariffo21-alt.github.io/apps/moviltrack/`
2. Toca **Compartir › Agregar a pantalla de inicio** para tenerla como app.
3. Fija el teléfono **horizontal** con un soporte, a **25–35 cm** de la cara del niño, con luz de frente.
4. Toca **Calibrar mirada**: el niño mira una estrella al centro, a la izquierda, al centro y a la derecha (unos 10 segundos).
5. Revisa la **prueba de mirada**: la zona que se ilumina debe coincidir con donde mira el niño.
6. Toca **Jugar**.

## Panel del adulto

Se abre **manteniendo presionado** el botón "Ajustes del adulto" durante 2 segundos,
para que el niño no lo cambie por accidente.

| Ajuste | Opciones |
|---|---|
| Vehículo | Auto o moto |
| Color | Azul, rojo, verde, blanco o negro |
| Clima | Sol o lluvia (siempre de día) |
| Dificultad | 1 (recta, lenta, solo estrellas) a 5 (curvas, rápido, conos) |
| Carriles | 2 (izquierda/derecha) o 3 (izquierda/centro/derecha) |
| Control | Mirada (cámara) o toque (sin cámara) |
| Ojo a seguir | Ambos, derecho o izquierdo del niño |
| Sensibilidad | Cuánto hay que mirar hacia el lado |
| Tiempo de fijación | 0,2 a 1,5 s sostenidos para confirmar el cambio |
| Parpadeo largo | Pausar o seguir con un parpadeo voluntario largo (opcional) |
| Duración de sesión | 1 a 10 minutos |

## Decisiones de diseño clínico

- **Sin "game over" ni castigo.** Los conos solo hacen un rebote suave y frenan un momento.
- **Sin destellos ni relámpagos** (riesgo de crisis fotosensibles). La lluvia es suave.
- **Tiempo de fijación** configurable: evita que una mirada de paso mueva el vehículo.
- **Pausa automática** si el rostro deja de verse; el juego sigue solo cuando vuelve.
- **Recentrar** desde la pausa: corrige la deriva si el niño o el teléfono se movieron.
- **Sesiones cortas** con registro para el terapeuta: estrellas, cambios de carril,
  tiempo de reacción promedio y % de tiempo con rostro detectado. Se puede exportar a CSV.

## Cómo funciona la detección de mirada

Se usa [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker)
(Google, Apache 2.0), que entrega 478 puntos de la cara, incluido el centro de cada iris.
Para cada ojo se calcula la posición del iris entre las dos esquinas del ojo (un valor de 0 a 1).
La calibración guarda ese valor al mirar el centro, la izquierda y la derecha; durante el juego
se compara con esos valores y se decide la zona (con filtro de mediana, suavizado e histéresis).

**Límites honestos:** una cámara común no logra la precisión de un equipo con luz infrarroja.
Distinguir **izquierda / centro / derecha** es confiable; arriba/abajo o un punto exacto de la
pantalla no lo es. Por eso el juego se diseñó con carriles anchos. Funciona mejor:

- con el teléfono **horizontal** (o en una **tablet**), porque los carriles quedan más separados;
- con la cabeza apoyada y quieta;
- con buena luz frontal y sin lentes con reflejos.

## Estructura del código

```
moviltrack/
├── index.html            Pantallas: inicio, ajustes, calibración, juego
├── styles.css
├── js/
│   ├── main.js           Control de pantallas, calibración, sesión
│   ├── gaze.js           Seguimiento de mirada (independiente del juego)
│   ├── game.js           Juego de carreras (canvas)
│   ├── vehicles.js       Dibujo de autos y motos
│   ├── settings.js       Ajustes guardados en el dispositivo
│   ├── history.js        Registro de sesiones y exportación CSV
│   └── audio.js          Sonidos sintetizados
├── sw.js                 Funcionamiento sin conexión
├── manifest.webmanifest  Instalación como app
└── vendor/mediapipe/     Detector (copia local, Apache 2.0)
```

`gaze.js` solo entrega "izquierda", "centro", "derecha" y "parpadeo largo".
Cualquier juego nuevo puede reutilizarlo sin cambios.

## Probar en un computador

Cualquier servidor estático sirve (la cámara requiere `https` o `localhost`):

```bash
python3 -m http.server 8000
```

Luego abre `http://localhost:8000/moviltrack/`. En modo toque también se puede jugar con las flechas del teclado.

## Ideas para próximas versiones

- Más juegos con el mismo motor de mirada (seguimiento de objetos, búsqueda visual).
- Tablero de comunicación simple (sí / no / necesidades) controlado con la mirada.
- Señal vertical (arriba/abajo) cuando la calidad lo permita.
- Versión nativa para iPhone usando la cámara TrueDepth (más precisa).
- Informe gráfico de progreso para el terapeuta.

## Licencia

Código de MovilTrack: [MIT](../LICENSE). MediaPipe: Apache 2.0 (ver `vendor/mediapipe/NOTICE.md`).
