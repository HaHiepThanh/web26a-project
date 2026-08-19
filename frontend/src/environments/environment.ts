// Cấu hình môi trường.
// Kiến trúc: frontend đăng nhập bằng Firebase, mọi dữ liệu đi qua backend (apiUrl).
// Frontend KHÔNG gọi Supabase trực tiếp — RLS đã chặn khoá công khai, chỉ backend
// (giữ service_role key) mới đọc/ghi được database.
export const environment = {
  production: false,

  // Firebase Web config — cấu hình Firebase của dự án (sao chép từ Firebase Console > Project Settings > Web App).
  firebase: {
    apiKey: 'YOUR_FIREBASE_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    appId: 'YOUR_FIREBASE_APP_ID',
  },

  apiUrl: 'http://localhost:3000', // URL backend NestJS
};
