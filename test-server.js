console.log('Testing server syntax...');
try {
  require('./server.js');
  console.log('Server loaded successfully!');
} catch (error) {
  console.error('Error loading server:', error.message);
  console.error('Stack:', error.stack);
}




