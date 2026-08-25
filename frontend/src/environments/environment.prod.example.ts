// Mẫu cấu hình môi trường production (sao chép thành environment.prod.ts rồi
// điền apiUrl đúng domain backend đã deploy).
export const environment = {
  production: true,
  firebase: {
    apiKey: 'YOUR_FIREBASE_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    appId: 'YOUR_FIREBASE_APP_ID',
  },
  apiUrl: 'https://YOUR-BACKEND-DOMAIN',
};
