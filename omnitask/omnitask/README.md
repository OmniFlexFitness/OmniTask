# Project Deployment using Google Cloud Build and Firebase Hosting

This project is set up for continuous deployment to Firebase Hosting using Google Cloud Build. When you push to the `live` branch of your GitHub repository, a Google Cloud Build trigger will automatically build and deploy your application to Firebase Hosting.

This document provides a detailed step-by-step guide to configure this entire workflow. The steps are broken down by the platform where you need to perform the action: **Your Local Machine**, **GitHub**, **Google Cloud**, and **Firebase**.

## Configuration Files

These files have been created for you and are in the root of this project (i.e., in the same directory as this `README.md` file):

- **`cloudbuild.yaml`:** This file defines the build and deployment steps for Google Cloud Build. It installs dependencies, builds the project, and deploys to Firebase Hosting.
- **`firebase.json`:** This file configures Firebase Hosting. It specifies the public directory (`build`), files to ignore, and rewrite rules for a single-page application.
- **`.firebaserc`:** This file associates your project with a Firebase project. **It has been created for you in this project's root directory.**
- **`index.html`:** A sample file to be deployed.

---

## Step 1: Your Local Machine & Firebase

On your local machine, you will perform two actions: update the `.firebaserc` file and get a Firebase CI token.

### 1.1: Update `.firebaserc`

1.  **Open the `.firebaserc` file** in your code editor.
2.  **Replace `"your-firebase-project-id"`** with your actual Firebase project ID. You can find your Firebase project ID in the [Firebase Console](https://console.firebase.google.com/). It's the unique identifier for your Firebase project.
3.  **Save the file.**

### 1.2: Get Your Firebase CI Token

1.  **Open your terminal** or command prompt.
2.  **Run the command `firebase login:ci`**. This command will open a new browser window and ask you to log in to your Google account.
3.  **Log in to the Google account** that has access to your Firebase project.
4.  **After logging in, you will be redirected to a page that displays a CI token.** This token is a secret and should be treated like a password.
5.  **Copy the token and save it somewhere safe.** You will need it in a later step.

---

## Step 2: GitHub

Now, you need to commit and push the configuration files to your GitHub repository.

1.  **Stage the files:** Open your terminal and run the following commands:
    ```bash
    git add .
    ```
2.  **Commit the files:**
    ```bash
    git commit -m "Add Firebase and Google Cloud Build configuration"
    ```
3.  **Push the files to the `live` branch:**
    ```bash
    git push origin live
    ```

---

## Step 3: Google Cloud

In the Google Cloud Console, you will create a Cloud Build trigger that watches your GitHub repository and starts the deployment process.

1.  **Navigate to the Cloud Build Triggers page:**
    - Open the [Google Cloud Console](https://console.cloud.google.com/).
    - In the navigation menu, go to **CI/CD** > **Cloud Build** > **Triggers**.
2.  **Click "Create trigger"**.
3.  **Fill out the trigger settings:**
    - **Name:** Give your trigger a descriptive name, such as `Deploy to Firebase from live branch`.
    - **Region:** Select your preferred region.
    - **Description:** (Optional) Add a description for your trigger.
    - **Event:** Select **Push to a branch**.
    - **Source:**
        - **Repository:** Select your GitHub repository from the list. If it's not there, you may need to connect your GitHub account to Google Cloud Build.
        - **Branch:** Enter `^live$`. This is a regular expression that matches the `live` branch exactly.
    - **Configuration:**
        - **Type:** Select **Cloud Build configuration file (yaml or json)**.
        - **Location:**
            - **Source:** Select **Repository**.
            - **Cloud Build file location:** Enter `cloudbuild.yaml`.
    - **Advanced:**
        - **Substitution variables:** Click **+ Add variable**.
            - **Variable:** `_FIREBASE_TOKEN`
            - **Value:** Paste the Firebase CI token you copied in Step 1.2.
4.  **Click "Create"** to save the trigger.

---

## Step 4: Firebase

The final step is to ensure your Firebase project is ready to receive deployments.

1.  **Go to the Firebase Console:** Open the [Firebase Console](https://console.firebase.google.com/).
2.  **Select your project.**
3.  **Go to the "Hosting" section** in the left-hand menu.
4.  **If you haven't already, click "Get started"** and follow the instructions to enable Firebase Hosting for your project.

---

## All Done!

Now, every time you push a change to the `live` branch of your GitHub repository, the Cloud Build trigger will automatically run, build your project, and deploy it to Firebase Hosting. You can monitor the build logs in the **History** tab of the Cloud Build section in the Google Cloud Console.
