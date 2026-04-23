const admin = require('firebase-admin');

// Initialize the app. Note: this assumes we are running locally with GOOGLE_APPLICATION_CREDENTIALS
// set, or we can use the default credentials if authenticated via gcloud.
admin.initializeApp({
  projectId: 'omnitask-475422',
});

const db = admin.firestore();

async function testEmail() {
  try {
    const docRef = await db.collection('mail').add({
      to: 'bertin.kenol@omniflexfitness.com',
      message: {
        subject: 'Test Email from OmniTask Extension Refactor',
        text: 'This is a test email to verify that the firestore-send-email Firebase extension is working properly.',
        html: '<h3>Test Email</h3><p>This is a test email to verify that the <strong>firestore-send-email</strong> Firebase extension is working properly.</p>',
      },
    });
    console.log('Successfully enqueued test email with document ID:', docRef.id);
    process.exit(0);
  } catch (error) {
    console.error('Error adding document:', error);
    process.exit(1);
  }
}

testEmail();
