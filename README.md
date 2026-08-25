# Lobos y Aldeanos

Web app básica para jugar "Lobos y Aldeanos" (Werewolf/Mafia) en familia. Un anfitrión crea una sala, decide cuántos personajes de cada tipo habrá (como armar el mazo de cartas físico), y comparte el código de 5 letras; cada persona que se une recibe al azar uno de los cupos que aún queden libres y lo ve en una pantalla privada tipo carta.

## Cómo funciona

- **Anfitrión**: crea la sala, define cuántos de cada personaje habrá (Lobo, Aldeano, Vidente, Bruja, Cazador, Cupido) con un contador +/− por personaje, ve cuántos jugadores se han unido y cuántos cupos quedan de cada tipo, y puede cerrar la sala, iniciar una nueva ronda o revelar los personajes asignados (para narrar la partida).
- **Jugadores**: entran con el código de la sala y su nombre, reciben al azar uno de los cupos de personaje que aún estén libres (nunca se reparte más de la cantidad configurada por tipo), y lo revelan tocando su carta (pantalla privada, pensada para no compartir). Si ya no quedan cupos libres, el intento de unirse se rechaza con un mensaje claro.

No implementa las fases de noche/día del juego: eso se juega de viva voz en familia, con el anfitrión como narrador. La app solo resuelve la parte tediosa (repartir personajes sin repetir cartas físicas).

## Stack

- Frontend: HTML/CSS/JS estático, sin build (carpeta `public/`).
- Backend: [Netlify Functions](https://docs.netlify.com/functions/overview/) (formato v2, `netlify/functions/`).
- Estado compartido de las salas: [Netlify Blobs](https://docs.netlify.com/blobs/overview/) (incluido en Netlify, no requiere una base de datos externa).

## Desarrollo local

```bash
npm install
npx netlify-cli dev
```

Abre `http://localhost:8888`.

## Despliegue en Netlify

1. Sube este repositorio a GitHub (o el proveedor que uses).
2. En Netlify: **Add new site → Import an existing project**, selecciona el repo.
3. Build settings: **Build command** vacío, **Publish directory** `public` (ya están en `netlify.toml`, Netlify los detecta solo).
4. Deploy. Netlify Blobs se activa automáticamente para el sitio, no hace falta configurar nada más.

También puedes desplegar con la CLI:

```bash
npx netlify-cli deploy --prod
```
