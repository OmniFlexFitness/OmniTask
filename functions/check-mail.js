const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function checkMail() {
  console.log('Fetching recent Mail collection entries...');
  try {
    const mailSnapshot = await db.collection('mail').get();

    console.log(`Found ${mailSnapshot.size} emails total.`);

    // sorting manually in case there is no index
    const sortedMail = mailSnapshot.docs
      .map((d) => ({ id: d.id, data: d.data() }))
      // delivery info or created timestamp might not exist, but let's try
      .slice(-5);

    sortedMail.forEach((doc) => {
      console.log(`\nMail ID: ${doc.id}`);
      console.log(`To: ${doc.data.to}`);
      console.log(`Subject: ${doc.data.message?.subject}`);
      console.log(`Delivery State:`, doc.data.delivery?.state);
      console.log(`Delivery Error:`, doc.data.delivery?.error);
    });
  } catch (error) {
    console.error('Error fetching mail:', error);
  }
}

async function checkNotifications() {
  console.log('\nFetching recent Notifications collection entries...');
  try {
    const notifSnapshot = await db
      .collection('notifications')
      .orderBy('sentAt', 'desc')
      .limit(3)
      .get();

    if (notifSnapshot.empty) {
      console.log('No notifications found.');
      return;
    }

    notifSnapshot.forEach((doc) => {
      const data = doc.data();
      const sentAtStr = data.sentAt ? data.sentAt.toDate().toISOString() : 'Unknown';
      console.log(`\nNotif ID: ${doc.id}`);
      console.log(`Type: ${data.type}`);
      console.log(`Task ID: ${data.taskId}`);
      console.log(`Recipient: ${data.recipientEmail}`);
      console.log(`Success: ${data.success}`);
      if (data.error) console.log(`Error: ${data.error}`);
      console.log(`Sent At: ${sentAtStr}`);
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
  }
}

async function main() {
  await checkMail();
  await checkNotifications();
}

main();
