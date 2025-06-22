const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

async function testPdfExtraction() {
  try {
    console.log('🔍 Testing PDF text extraction...\n');
    
    // Find a PDF file in uploads directory
    const uploadsDir = path.join(__dirname, 'uploads');
    
    if (!fs.existsSync(uploadsDir)) {
      console.log('❌ No uploads directory found. Please upload some PDFs first.');
      return;
    }
    
    const pdfFiles = fs.readdirSync(uploadsDir).filter(file => file.endsWith('.pdf'));
    
    if (pdfFiles.length === 0) {
      console.log('❌ No PDF files found in uploads directory. Please upload some PDFs first.');
      return;
    }
    
    console.log(`📁 Found ${pdfFiles.length} PDF file(s) in uploads directory:`);
    pdfFiles.forEach((file, index) => {
      console.log(`   ${index + 1}. ${file}`);
    });
    
    // Test the first PDF file
    const testFile = pdfFiles[0];
    console.log(`\n🧪 Testing extraction on: ${testFile}`);
    
    const filePath = path.join(uploadsDir, testFile);
    const pdfBuffer = fs.readFileSync(filePath);
    
    console.log('⏳ Extracting text...');
    const startTime = Date.now();
    
    const pdfData = await pdfParse(pdfBuffer);
    
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    console.log('\n✅ Extraction completed successfully!');
    console.log(`⏱️  Processing time: ${processingTime}ms`);
    console.log(`📄 Page count: ${pdfData.numpages}`);
    console.log(`📝 Text length: ${pdfData.text.length} characters`);
    console.log(`📊 Words: ${pdfData.text.split(/\s+/).length}`);
    
    if (pdfData.info) {
      console.log('\n📋 PDF Metadata:');
      console.log('   Title:', pdfData.info.Title || 'N/A');
      console.log('   Author:', pdfData.info.Author || 'N/A');
      console.log('   Subject:', pdfData.info.Subject || 'N/A');
      console.log('   Creator:', pdfData.info.Creator || 'N/A');
      console.log('   Producer:', pdfData.info.Producer || 'N/A');
    }
    
    // Show text preview
    const textPreview = pdfData.text.substring(0, 500);
    console.log('\n📄 Text Preview (first 500 characters):');
    console.log('─'.repeat(50));
    console.log(textPreview);
    if (pdfData.text.length > 500) {
      console.log('\n... (truncated)');
    }
    console.log('─'.repeat(50));
    
    // Test basic text cleanup
    let cleanedText = pdfData.text
      .replace(/\n\s*\n/g, '\n\n')
      .replace(/\s+/g, ' ')
      .trim();
    
    console.log(`\n🧹 After cleanup: ${cleanedText.length} characters`);
    
    if (!cleanedText || cleanedText.length < 10) {
      console.log('⚠️  Warning: Very little text extracted. This PDF might be image-based or encrypted.');
    } else {
      console.log('✅ Text extraction looks good!');
    }
    
    // Test all PDFs quickly
    if (pdfFiles.length > 1) {
      console.log(`\n🔄 Quick test of all ${pdfFiles.length} PDF files:`);
      
      for (let i = 0; i < pdfFiles.length; i++) {
        try {
          const fileName = pdfFiles[i];
          const filePath = path.join(uploadsDir, fileName);
          const pdfBuffer = fs.readFileSync(filePath);
          const pdfData = await pdfParse(pdfBuffer);
          
          console.log(`   ${i + 1}. ${fileName}`);
          console.log(`      Pages: ${pdfData.numpages}, Text: ${pdfData.text.length} chars`);
          
        } catch (error) {
          console.log(`   ${i + 1}. ${pdfFiles[i]} - ❌ Error: ${error.message}`);
        }
      }
    }
    
    console.log('\n🎉 Text extraction test completed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('   Full error:', error);
  }
}

// Run the test
testPdfExtraction(); 