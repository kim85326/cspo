# Maestro 手機端自動化

流程用 YAML 寫，幾乎是驗收條件的直譯。PO 與測試同學可以直接讀。

## 安裝（工程同學的電腦）

```bash
brew tap mobile-dev-inc/tap && brew install maestro
```

## 執行

1. 先開 iOS 模擬器或 Android 模擬器，並在上面用 Expo Go 開啟本專案。
2. 執行：

```bash
npm run e2e
```

## 寫法

- `tapOn: "股票代號"` 會找畫面上文字或 accessibilityLabel 等於「股票代號」的元件。
- 畫面上的中文標籤就是 AC 裡的中文，改 AC 時兩邊一起改。
