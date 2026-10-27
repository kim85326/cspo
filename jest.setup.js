// AsyncStorage 的原生模組在 Jest 裡不存在，官方提供記憶體版 mock。
// 所有測試共用這個設定；要讀寫 holdingStore 的測試在 beforeEach 記得 AsyncStorage.clear()。
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
