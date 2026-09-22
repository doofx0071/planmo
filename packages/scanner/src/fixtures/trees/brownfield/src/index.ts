// Brownfield fixture entry point (synthetic content only).
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? '3000');
createApp().listen(port, () => {
  console.log(`brownfield listening on :${port}`);
});
