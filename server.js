const express = require('express');
const { google } = require('googleapis');
const path = require('path');

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Sirve los archivos estáticos desde la carpeta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Inicializa el cliente de Google OAuth con las variables de entorno
const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// Variable para almacenar los tokens. ¡IMPORTANTE! Esto se borrará al reiniciar.
let token;

// Ruta para iniciar el flujo de autenticación de Google
app.get('/auth/google', (req, res) => {
    const authorizeUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline', // Esto asegura que obtendrás un refresh_token
        scope: ['https://www.googleapis.com/auth/drive.file'],
        prompt: 'consent'
    });
    res.redirect(authorizeUrl);
});

// Ruta para manejar el callback de Google OAuth
app.get('/auth/google/callback', async (req, res) => {
    try {
        const { code } = req.query;
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        token = tokens; 
        
        // ¡ESTO ES LO QUE NECESITAS! Busca este mensaje en los logs de Render
        console.log('Token de autenticación completo:', tokens);
        
        // Redirige al usuario a la página principal una vez autenticado
        res.redirect('/');
    } catch (error) {
        console.error('Error al manejar el callback de Google:', error);
        res.status(500).send('Error de autenticación.');
    }
});

// Ruta para subir un archivo a Google Drive
app.post('/upload', async (req, res) => {
    try {
        if (!token) {
            return res.status(401).json({ error: 'No autorizado. Por favor, autentícate de nuevo.' });
        }
        oAuth2Client.setCredentials(token);
        const drive = google.drive({ version: 'v3', auth: oAuth2Client });
        
        const { name, content } = req.body;
        const fileContent = Buffer.from(content, 'base64');
        const fileMetadata = { 'name': name };
        const media = {
            mimeType: path.extname(name) === '.mp4' ? 'video/mp4' : 'image/jpeg',
            body: fileContent
        };
        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id'
        });

        res.status(200).json({ id: file.data.id });
    } catch (error) {
        console.error('Error al subir el archivo:', error);
        res.status(500).json({ error: 'Error al subir el archivo.' });
    }
});

// Ruta para listar los archivos de Google Drive
app.get('/list', async (req, res) => {
    try {
        if (!token) {
            return res.status(401).json({ error: 'No autorizado. Por favor, autentícate de nuevo.' });
        }
        oAuth2Client.setCredentials(token);
        const drive = google.drive({ version: 'v3', auth: oAuth2Client });
        
        const response = await drive.files.list({
            q: "mimeType='image/jpeg' or mimeType='image/png' or mimeType='video/mp4'",
            fields: 'nextPageToken, files(id, name)',
        });
        const files = response.data.files;
        res.status(200).json(files);
    } catch (error) {
        console.error('Error al listar archivos:', error);
        res.status(500).json({ error: 'Error al listar archivos.' });
    }
});

// Ruta para descargar un archivo de Google Drive
app.get('/download/:fileId', async (req, res) => {
    try {
        if (!token) {
            return res.status(401).json({ error: 'No autorizado. Por favor, autentícate de nuevo.' });
        }
        oAuth2Client.setCredentials(token);
        const drive = google.drive({ version: 'v3', auth: oAuth2Client });
        
        const fileId = req.params.fileId;
        const response = await drive.files.get({
            fileId: fileId,
            alt: 'media'
        }, { responseType: 'stream' });

        response.data
            .on('end', () => { console.log('Descarga completa'); })
            .on('error', err => {
                console.error('Error durante la descarga:', err);
                res.status(500).send('Error de descarga.');
            })
            .pipe(res);
            
    } catch (error) {
        console.error('Error al descargar el archivo:', error);
        res.status(500).send('Error al descargar el archivo.');
    }
});

// Inicio del servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor escuchando en el puerto ${port}`);
});
