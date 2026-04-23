const admin = require('firebase-admin');

// Ensure we don't try to initialize multiple times
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function checkRecentTasks() {
  console.log('Fetching the 3 most recently updated tasks...');
  try {
    const tasksSnapshot = await db.collection('tasks').orderBy('updatedAt', 'desc').limit(3).get();

    if (tasksSnapshot.empty) {
      console.log('No tasks found.');
      return;
    }

    tasksSnapshot.forEach((doc) => {
      const data = doc.data();
      const updatedStr = data.updatedAt ? data.updatedAt.toDate().toISOString() : 'Unknown';
      console.log(`\nTask ID: ${doc.id}`);
      console.log(`Title: ${data.title}`);
      console.log(`AssigneeIds:`, data.assigneeIds);
      console.log(`AssignedToId:`, data.assignedToId);
      console.log(
        `Subtasks with assignees:`,
        data.subtasks?.map((s) => s.assigneeIds),
      );
      console.log(`Status: ${data.status}`);
      console.log(`UpdatedAt: ${updatedStr}`);
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
  }
}

checkRecentTasks();
