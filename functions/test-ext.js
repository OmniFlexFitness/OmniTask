const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function addTestMail() {
  console.log("Adding a basic test email to the 'mail' collection...");
  try {
    const docRef = await db.collection('mail').add({
      to: 'bertin.kenol@omniflexfitness.com',
      message: {
        subject: 'Basic Extension Test',
        text: 'This is a test of the firestore-send-email extension from an admin script.',
      },
    });
    console.log(`Document written with ID: ${docRef.id}`);

    // Wait for 5 seconds to let the extension process it
    console.log('Waiting 10 seconds for extension to process...');
    await new Promise((resolve) => setTimeout(resolve, 10000));

    const docAfter = await docRef.get();
    console.log('Delivery info after 10s:', docAfter.data()?.delivery);
  } catch (error) {
    console.error('Error writing test mail:', error);
  }
}

addTestMail();
