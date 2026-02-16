require('dotenv').config();
const https = require('https');

const apiKey = process.env.RESEND_API_KEY;

console.log('🌐 Testing Resend API connectivity from localhost...');
console.log('🔑 API Key found:', !!apiKey);

const options = {
  hostname: 'api.resend.com',
  path: '/emails',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  console.log('📡 Status:', res.statusCode);
  console.log('📡 Headers:', JSON.stringify(res.headers, null, 2));

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('📡 Response:', data);
    try {
      const parsed = JSON.parse(data);
      if (parsed.data) {
        console.log('✅ Email sent successfully!');
        console.log('📧 Email ID:', parsed.data.id);
      } else if (parsed.error) {
        console.log('❌ API Error:', parsed.error);
      }
    } catch (e) {
      console.log('❌ Could not parse response');
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Network error:', e.message);
  console.error('💡 This could mean:');
  console.error('   - No internet connection');
  console.error('   - Firewall blocking HTTPS');
  console.error('   - Corporate proxy blocking API calls');
});

req.write(JSON.stringify({
  from: 'PathPilo <onboarding@resend.dev>',
  to: ['delivered@resend.dev'],
  subject: 'Localhost Connectivity Test',
  html: '<h1>Success!</h1><p>This email was sent from localhost.</p><p>Time: ' + new Date().toISOString() + '</p>'
}));

req.end();
