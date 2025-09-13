const express = require('express');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Carga las credenciales directamente en el código
// ! IMPORTANTE: En producción, usa variables de entorno para las credenciales.
const client_id = process.env.GOOGLE_CLIENT_ID;
const client_secret = process.env.GOOGLE_CLIENT_SECRET;
const redirect_uri = process.env.GOOGLE_REDIRECT_URI;

const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uri
);

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// --- Rutas de autenticación ---
app.get('/auth/google', (req, res) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  res.redirect(authUrl);
});

app.get('/auth/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    res.send('Autenticación exitosa! Ahora puedes subir archivos.');
  } catch (error) {
    res.status(500).send('Error de autenticación.');
  }
});

// --- Rutas para la API de Google Drive ---

// Ruta para subir un archivo
app.post('/upload', async (req, res) => {
  try {
    const drive = google.drive({ version: 'v3', auth: oAuth2Client });
    const { name, content } = req.body;
    const fileMetadata = { name: name };
    const media = {
      mimeType: 'text/plain',
      body: content,
    };
    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id',
    });
    res.status(200).json({ id: file.data.id });
  } catch (error) {
    res.status(500).json({ error: 'Error al subir el archivo.' });
  }
});

// Ruta para descargar un archivo por su ID
app.get('/download/:fileId', async (req, res) => {
  try {
    const drive = google.drive({ version: 'v3', auth: oAuth2Client });
    const fileId = req.params.fileId;
    const fileStream = await drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'stream' }
    );
    fileStream.data.pipe(res);
  } catch (error) {
    res.status(500).json({ error: 'Error al descargar el archivo.' });
  }
});

// --- Inicio del servidor ---
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor escuchando en el puerto ${port}`);
});



