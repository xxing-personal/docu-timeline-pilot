const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_BASE_URL = 'http://localhost:3000';

async function testStatusUpdates() {
  try {
    // Find a test PDF file in the uploads directory
    const uploadsDir = path.join(__dirname, 'uploads');
    let testFile = null;
    
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));
      if (pdfFiles.length > 0) {
        testFile = path.join(uploadsDir, pdfFiles[0]);
        console.log(`Using existing PDF: ${pdfFiles[0]}`);
      }
    }
    
    if (!testFile) {
      console.log('No PDF files found in uploads directory. Please upload a PDF first.');
      return;
    }
    
    // Upload the file
    const form = new FormData();
    form.append('pdf', fs.createReadStream(testFile));
    
    console.log('Uploading PDF...');
    const uploadResponse = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      body: form,
    });
    
    if (!uploadResponse.ok) {
      throw new Error('Upload failed');
    }
    
    const uploadResult = await uploadResponse.json();
    console.log('Upload successful:', uploadResult);
    
    const taskId = uploadResult.taskId;
    
    // Monitor status changes
    console.log('\nMonitoring status changes...');
    for (let i = 0; i < 30; i++) { // Monitor for 30 seconds
      try {
        const statusResponse = await fetch(`${API_BASE_URL}/status/${taskId}`);
        if (statusResponse.ok) {
          const status = await statusResponse.json();
          console.log(`[${new Date().toLocaleTimeString()}] Status: ${status.status}${status.startedAt ? ` (started: ${new Date(status.startedAt).toLocaleTimeString()})` : ''}${status.completedAt ? ` (completed: ${new Date(status.completedAt).toLocaleTimeString()})` : ''}`);
          
          if (status.status === 'completed' || status.status === 'failed') {
            console.log('Processing finished:', status);
            break;
          }
        }
      } catch (error) {
        console.error('Status check error:', error.message);
      }
      
      // Wait 1 second between checks
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

// Run the test
testStatusUpdates(); 