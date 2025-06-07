import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3000;
app.use(cors({ origin: '*' }));


// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer setup for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'));
    }
  },
});



app.post('/upload', upload.single('pdf'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded or file is not a PDF.' });
    return;
  }
  res.json({
    message: 'PDF uploaded successfully!',
    filename: req.file.filename,
    path: req.file.path,
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the API!' });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 