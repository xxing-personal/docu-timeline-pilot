const fs = require('fs/promises');
const path = require('path');

async function clearAllDatabases() {
  console.log('🗑️ Starting database cleanup...');
  
  const dataDir = path.join(process.cwd(), 'data');
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const extractedTextsDir = path.join(process.cwd(), 'extracted-texts');
  
  try {
    // Clear data directory files
    const dataFiles = [
      'pdf-tasks.json',
      'agent-queue-database.json',
      'agent-queue.json',
      'memory-history.json',
      'indices-database.json',
      'chat-history.json',
      'chat-database.json',
      'database.json'
    ];
    
    for (const file of dataFiles) {
      const filePath = path.join(dataDir, file);
      try {
        await fs.unlink(filePath);
        console.log(`✅ Deleted: ${file}`);
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log(`ℹ️  File not found (already deleted): ${file}`);
        } else {
          console.error(`❌ Error deleting ${file}:`, error.message);
        }
      }
    }
    
    // Clear uploads directory
    try {
      const uploadFiles = await fs.readdir(uploadsDir);
      for (const file of uploadFiles) {
        if (file.endsWith('.pdf')) {
          await fs.unlink(path.join(uploadsDir, file));
          console.log(`✅ Deleted uploaded PDF: ${file}`);
        }
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('ℹ️  Uploads directory not found');
      } else {
        console.error('❌ Error clearing uploads:', error.message);
      }
    }
    
    // Clear extracted texts directory
    try {
      const extractedFiles = await fs.readdir(extractedTextsDir);
      for (const file of extractedFiles) {
        if (file.endsWith('.md')) {
          await fs.unlink(path.join(extractedTextsDir, file));
          console.log(`✅ Deleted extracted text: ${file}`);
        }
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('ℹ️  Extracted texts directory not found');
      } else {
        console.error('❌ Error clearing extracted texts:', error.message);
      }
    }
    
    console.log('\n🎉 All databases cleared successfully!');
    console.log('\n📋 Summary of cleared data:');
    console.log('   • PDF task database');
    console.log('   • Agent queue database');
    console.log('   • Memory snapshots');
    console.log('   • Indices database');
    console.log('   • Chat history');
    console.log('   • Uploaded PDF files');
    console.log('   • Extracted text files');
    
  } catch (error) {
    console.error('❌ Error during database cleanup:', error);
    process.exit(1);
  }
}

// Run the cleanup
clearAllDatabases();
