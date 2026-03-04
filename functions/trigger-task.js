const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function triggerTaskEmail() {
  console.log('Creating a test task to trigger sendTaskAssignmentEmail...');
  try {
    const taskData = {
      title: 'Direct SMTP Test Task',
      description: 'Testing the nodemailer implementation from the Cloud Function.',
      projectId: 'test_project_123',
      status: 'todo',
      priority: 'high',
      assigneeIds: ['bertin.kenol@omniflexfitness.com'],
      notifyAssignees: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection('tasks').add(taskData);
    console.log(`Task created with ID: ${docRef.id}`);

    // Wait for 10 seconds to let the Cloud Function process it
    console.log('Waiting 10 seconds to check notifications...');
    await new Promise((resolve) => setTimeout(resolve, 10000));

    console.log('Fetching recent notifications...');
    const notificationsSnapshot = await db
      .collection('notifications')
      .orderBy('sentAt', 'desc')
      .limit(3)
      .get();

    notificationsSnapshot.forEach((doc) => {
      console.log(`Notification [${doc.id}]:`, doc.data());
    });
  } catch (error) {
    console.error('Error creating test task:', error);
  }
}

triggerTaskEmail();
