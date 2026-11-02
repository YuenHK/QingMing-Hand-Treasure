# 揮手鑑古｜尋寶清明上河圖

用手掌揮開迷霧，走入古畫尋寶。適合小朋友與家長一齊玩嘅廣東話網頁遊戲，亦展示 AI 點樣將鏡頭入面嘅手部關鍵點變成操作指令。

**[立即遊玩](https://yuenhk.github.io/qingming-hand-treasure/)** · 建議用電腦版 Chrome／Edge 配合鏡頭揮手；滑鼠只作輔助操作。

## 宣傳海報

揮手鑑古 · 走進清明上河全圖

![橫向海報](assets/public-poster/landscape-preview.png)

[橫向 PDF](assets/public-poster/landscape.pdf) · [Full HD 圖片](assets/public-poster/landscape-preview.png) · [4K 圖片](assets/public-poster/landscape-4k.png)

只提供此款 16:9 公開版橫向海報，採用原畫市集局部、手部關鍵點及遊戲 QR code。原畫來源見下方；Noto 字型授權見 [FONTS-LICENSE.txt](assets/public-poster/FONTS-LICENSE.txt)。

## 點樣玩

1. 開啟頁面並允許鏡頭後，介紹頁已可顯示實景與手勢。張開手掌，將光點移到「揮手入畫」，停留即可開始；亦可用滑鼠輔助。
2. 張開手掌移動光圈；家長可隨時用滑鼠輔助，滑鼠停低約三秒後，手勢可以接返。
3. 照住物件約兩秒，聽廣東話講解用途與畫中生活。每關搵齊兩件，五關共十件。
4. 通關後，金色光粒子用約 3 秒消融灰幕，再用約 48 秒由城內到城外慢慢回望全彩長卷；抵達城門即顯示完成畫面，背景分頁不會跳過回放。
5. 張開手掌停留或按「再玩一次」，返回玩法說明，鏡頭保持啟動，下一位玩家可直接揮手開始。

介紹頁以單屏排版顯示畫卷簡介、三步玩法及開始按鈕，背景有半透明長卷緩緩移動，不用上下捲動。活動海報只放本專案 README，遊戲內不顯示。較矮視窗會自動調整整張介紹卡的比例。「畫卷簡介」可重新打開介紹；廣東話講解長期開啟，配樂預設播放，右欄不設聲音開關。操作員按 C 可開啟鏡頭設定，按 R 返回玩法說明。

## 畫卷與 AI

遊戲使用1736年由五位清宮畫家合作完成、國立故宮博物院收藏嘅「清院本《清明上河圖》」，與北宋張擇端本屬不同版本。主頁附[故宮作品資料](https://digitalarchive.npm.gov.tw/Collection/Detail/3782?dep=P)。路線由城門外、城內大街、街市、河岸園林到深處樓閣，係遊戲策展路線。

MediaPipe Hand Landmarker 找出手部21個關鍵點，程式再計算手掌位置、手指伸展程度及平滑軌跡。右欄直接顯示實景與骨架，放大的座標軌跡格會隨可用空間伸展，方便理解 AI 與程式各自做緊乜。**鏡頭影像只在玩家瀏覽器處理，不錄影、不上傳，不需要帳戶。** 首次使用會下載本專案內嘅模型與素材。

廣東話講解為預先生成嘅本機 MP3；背景五聲音階配樂與尋寶音效由 Web Audio 即時合成，講解時音樂會自動降低。瀏覽器若限制自動發聲，需先輕按畫面或鍵盤一次。公開版使用原畫放大細節與自製光效，沒有轉載故宮動畫影片。

畫卷以最大 2048 像素寬的小圖分塊載入，先顯示輕量預覽，再補清晰細節。全彩回望不會逐幀重新計算灰階；通關消融使用低解像遮罩及預先繪製的光點，減少舊電腦的繪圖負擔。

## 本機開發

需要 Python 3；修改與測試程式另需 Node.js 22。

```sh
python start_game.py
node --test tests/*.test.mjs
python scripts/build_site.py
```

不要直接以 file:// 開啟；鏡頭需要 HTTPS 或 localhost。手機可瀏覽介紹，遊戲介面以電腦橫向畫面為主。

- `chapters.js`：關卡、物件座標、廣東話描述。
- `portal.js`：光圈、尋寶、轉場與通關演出。
- `scroll-atlas.mjs`／`reveal.mjs`：分塊畫卷、預覽後備與輕量通關消融。
- `input-router.mjs`：滑鼠優先接手與手勢恢復規則。
- `camera.mjs`／`hand-worker.mjs`：鏡頭、關鍵點、背景 AI 推論。
- `game-audio.mjs`：配樂、提示音與廣東話播放。
- `site-files.json`：實際網站檔案與 SHA-256。更新程式或素材時，亦需同步更新相應雜湊值。

## 部署與素材

GitHub Pages 使用 `.github/workflows/pages.yml`：先跑自動測試，再校驗素材雜湊、建立 `dist/`、部署。Repository Settings → Pages 的 Source 設為 GitHub Actions。詳見[GitHub Pages 官方說明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

原畫影像來自 [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:QingMingShangHeTu_Big.jpg)，來源頁標示 Public Domain／PD-Art。原畫、套件及語音來源保留於 `assets/SOURCES.json`、`vendor/mediapipe/SOURCE.json` 及 `assets/narration/manifest.json`，MediaPipe 授權見 `vendor/mediapipe/LICENSE`。第三方素材各依原有授權；公開程式碼不代表所有素材均可任意另行授權。

通關消融及回放期間會切換成較輕快的五聲音階慶祝配樂，並在回放畫卷上顯示緩緩上飄的金色光粒子；到完成對話框或重新開始時回復平靜配樂。粒子只重用一張 48 像素光點貼圖，每幀固定繪製 28 點，不使用逐點陰影模糊。

右欄下方以三步大字說明「手部關鍵點辨識 → 座標映射與平滑處理 → 停留判定與事件觸發」，每步附簡短說明，方便工作人員講解。已移除右欄底部的本機處理提示文字；影像處理方式不受版面文字調整影響。

啟動區以較大的「舉手提示 → 停留說明 → 開始按鈕」排列，移除介紹卡最底的鏡頭提示。尋寶光圈會留下約 0.9 秒的金色光點拖尾，最多重用 24 個光點，暫停時逐漸消失，重玩時清除。
