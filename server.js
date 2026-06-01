const express = require('express');
const multer = require('multer');
const Replicate = require('replicate');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const upload = multer({ dest: 'uploads/' });
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

if (!fs.existsSync('results')) fs.mkdirSync('results');
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

app.use(express.static('.'));
app.use('/results', express.static(path.join(__dirname, 'results')));

app.post('/generate', upload.single('photo'), async (req, res) => {
  let filePath = req.file ? req.file.path : null;
  try {
    const imageBuffer = fs.readFileSync(filePath);
    const base64Image = imageBuffer.toString('base64');
    const dataUri = `data:${req.file.mimetype};base64,${base64Image}`;

    console.log('Sending to Replicate...');

    const output = await replicate.run(
      "flux-kontext-apps/professional-headshot",
      {
        input: {
          input_image: dataUri,
          prompt: "professional LinkedIn headshot, business attire, studio lighting, clean background, photorealistic"
        }
      }
    );

    console.log('Output type:', typeof output);
    console.log('Is array:', Array.isArray(output));
    console.log('Constructor:', output?.constructor?.name);

    // Collect all chunks
    let allChunks = [];
    
    if (output && typeof output[Symbol.asyncIterator] === 'function') {
      console.log('Iterating async...');
      for await (const chunk of output) {
        console.log('Chunk type:', typeof chunk, chunk?.constructor?.name);
        if (chunk instanceof Uint8Array || Buffer.isBuffer(chunk)) {
          allChunks.push(Buffer.from(chunk));
        } else if (typeof chunk === 'string') {
          allChunks.push(Buffer.from(chunk));
        }
      }
    } else if (output instanceof Uint8Array) {
      allChunks.push(Buffer.from(output));
    } else if (Buffer.isBuffer(output)) {
      allChunks.push(output);
    } else if (typeof output === 'string') {
      // It's a URL
      const filename = `headshot_${Date.now()}.jpg`;
      fs.unlinkSync(filePath);
      return res.json({ success: true, images: [output] });
    }

    fs.unlinkSync(filePath);

    if (allChunks.length === 0) {
      console.log('No chunks collected, output was:', JSON.stringify(output)?.substring(0, 200));
      return res.status(500).json({ success: false, error: 'No image data received' });
    }

    const imageBuffer2 = Buffer.concat(allChunks);
    console.log('Total bytes:', imageBuffer2.length);

    const filename = `headshot_${Date.now()}.jpg`;
    const filepath = path.join(__dirname, 'results', filename);
    fs.writeFileSync(filepath, imageBuffer2);
    console.log('Saved to:', filepath);

    res.json({ success: true, images: [`/results/${filename}`] });

  } catch (error) {
    console.error('Error:', error.message);
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(3000, () => console.log('Server running at http://localhost:3000'));
