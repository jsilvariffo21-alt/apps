# MediaPipe Tasks Vision (copia incluida)

Estos archivos provienen del paquete npm `@mediapipe/tasks-vision@0.10.14` y del
modelo `face_landmarker.task` (float16, versión 1), ambos publicados por Google
bajo la licencia **Apache License 2.0** (https://www.apache.org/licenses/LICENSE-2.0).

Se incluyen dentro del repositorio para que MovilTrack funcione sin depender de
servidores externos y pueda usarse sin conexión una vez instalado.

- `vision_bundle.mjs`: biblioteca JavaScript (se eliminó solo la línea `sourceMappingURL`).
- `wasm/`: motor WebAssembly (con y sin SIMD).
- `face_landmarker.task`: modelo de 478 puntos faciales, incluidos los iris.

Fuente: https://github.com/google-ai-edge/mediapipe
