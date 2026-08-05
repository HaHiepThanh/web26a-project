// Cấu hình môi trường.
// Kiến trúc: frontend đăng nhập bằng Firebase, mọi dữ liệu đi qua backend (apiUrl).
// Frontend KHÔNG gọi Supabase trực tiếp nữa (backend lo, xem quyết định Full backend).
export const environment = {
  production: false,
  // TODO(học viên): dán config từ Firebase Console > Project settings > Web app.
  firebase: {
    apiKey: 'YOUR-FIREBASE-API-KEY',
    authDomain: 'YOUR-PROJECT.firebaseapp.com',
    projectId: 'YOUR-PROJECT',
    appId: 'YOUR-APP-ID',
  },
  apiUrl: 'http://localhost:3000', // URL backend NestJS
};
