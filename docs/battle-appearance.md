# Battle appearance and images / バトルの表示デザインと画像

## 日本語

### 表示デザインの設定

表示デザインは、各イベントの既存のNostrセッションイベントと一緒に保存します。テーマが未設定のイベントは、これまでの表示を維持します。管理画面では、プリセット、5種類の色、3種類のシステムフォント、背景の暗さ、背景・参加者の画像を設定でき、サンプルのプレビューを見ながら調整できます。「保存」を押すと、公開画面が次にデータを読み込んだときに反映されます。

背景と文字の色が近すぎる場合は、表示時に文字・テーマ色・参加者色の明るさを補正します。入力した色そのものは保存設定に残します。写真を使う場合も、参加者名や得点、説明文、設定メニューには配色に合った背景を敷き、画像の明暗に左右されないようにしています。

通常のZapもLEGEND ZAPも、白とオレンジの文字を使います。通常のZapはイベントの背景色・背景画像をそのまま残し、その上に文字・光・紙吹雪を重ねます。文字には暗い縁取りと影を付け、明るい背景や写真でも読みやすくしています。LEGEND ZAPだけは演出中に黒い背景で画面全体を覆い、終了すると設定したイベント画面に戻ります。演出のプレビューにも、設定中の背景色・背景画像が反映されます。

### Vercelプロジェクトの設定

このプロジェクトはMITライセンスで公開されています。利用するVercelプロジェクトにGitHubリポジトリを接続すると、プッシュ時の自動デプロイを設定できます。画像の保存先も、デプロイ先のプロジェクトに接続してください。

画像を利用するには、Vercelプロジェクトの管理者が「Storage」タブで**公開（public）**のBlobストアを作成し、必要な環境に接続してください。SDKはVercel OIDCと`BLOB_STORE_ID`の組み合わせ、または`BLOB_READ_WRITE_TOKEN`を使用します。これらの認証情報はブラウザに公開しません。`ADMIN_TOKEN`の設定も必要で、未設定の場合は画像の書き込みを拒否します。ストレージの接続後は、環境変数を反映するために再デプロイしてください。

ストレージが未接続でも、色やフォントなどのテーマ設定は利用できます。画像のアップロードは接続エラーになり、ストアを自動作成することはありません。

### 画像の処理と保存

アップロードできる形式はJPEG・PNG・WebPで、上限は2 MiB・2,400万画素です。サーバーで画像をデコードして形式を検証し、向きを補正してメタデータを削除します。拡大はせず、縦横とも1,920ピクセル以内に収め、品質80のWebPに変換します。画像は`battles/<battle-id>/`配下に固有の名前で保存し、ブラウザは公開Blob URLから直接読み込みます。Nostrのセッションイベントに含めるのは画像のURLだけです。

画像ファイルはアップロードした時点で保存されます。イベントの「保存」を押すと、その画像のURLがイベントに紐づきます。編集画面で画像を外す、デザインを初期化する、イベントを無効にするといった操作では、Blob内の画像ファイル自体は削除しません。同じ公開URLを参照している別のイベントを壊さないよう、古い画像や未使用のアップロード画像も当面は保持します。不要な画像は、プロジェクト管理者が「Storage」で確認して手動削除できます。イベントをまたいだ自動削除は未実装です。

画像は公開されます。古いNostrイベントに過去の画像URLが残る場合もあります。ストレージ容量、操作回数、配信量が利用量に加算されるため、利用しているプランと利用状況を確認してください。アップロードにはFunctionを経由するため、そのリクエスト数と転送量も利用量に含まれます。

### 検証範囲

テーマの正規化テストでは、既存イベントとの互換性、許可された色・フォント・URL、値の範囲を確認しています。アップロードのテストでは、認証がない場合の拒否、JPEGからWebPへの変換と縮小、メタデータの削除、SVGや画像以外のファイルの拒否を確認しています。ブラウザでの確認はセッションの応答をテスト用に差し替えて行い、本番データを書き換えずに保存・再読み込み、公開画面のスタイル、PC・スマートフォンでの表示を検証しています。実際のNostrリレーへの公開とBlobへの書き込みは、デプロイ先の環境が必要で、ローカルでは実行していません。

## English

Appearance is saved with each existing Nostr session event. Sessions without a theme retain their original appearance. The admin editor provides presets, five colors, three system-font stacks, background darkness, background/player image uploads and a live sample preview. Save applies the draft to the public display on its next refresh.

If foreground and background colors are too similar, rendering adjusts the brightness of text, accent and participant colors without rewriting the saved theme. Text-bearing areas, including participant names, scores, descriptions and settings menus, use a matching solid surface so photos cannot remove their contrast.

All Zap effects, including LEGEND ZAP, use white/orange text. Regular Zaps keep the event's background color/image visible and overlay only text, light and confetti; dark text outlines and shadows preserve readability on light colors and photos. LEGEND ZAP alone temporarily covers the full display with an opaque black background, then reveals the configured event again. Effect previews also show the draft background color/image.

### Vercel project setup

This project is available under the MIT license. Connect the repository to your Vercel project to configure automatic deployments on push. Connect image storage to the project where you deploy the app.

An administrator of your Vercel project must create a **public** Blob store in the project's Storage tab and connect it to the required environments. The SDK can use `BLOB_STORE_ID` with Vercel OIDC, or `BLOB_READ_WRITE_TOKEN`. Neither credential is exposed to the browser. `ADMIN_TOKEN` must also be configured; image writes reject requests if it is absent. After connecting storage, redeploy so the environment variables are available.

Without storage connected, theme controls continue to work; image uploads return a connection error. No store is provisioned automatically.

### Image handling

Uploads accept JPEG, PNG and WebP, up to 2 MiB and 24 megapixels. The server verifies the decoded format, applies orientation, strips metadata, resizes within 1920 × 1920 without enlarging and encodes WebP at quality 80. Uploads have unique names under `battles/<battle-id>/`; browsers fetch the public Blob URL directly. Only the URL is included in the session event.

Uploading a file persists it immediately; saving the battle attaches its URL to the session. Removing an image from the editor, resetting the design or deactivating a battle does **not** physically delete the Blob. Old and abandoned uploads are retained for now, to avoid breaking another battle that references the same public URL. A project administrator can review unused assets in Storage and delete them manually. Automatic cross-session cleanup is not implemented.

Images are public. Old Nostr events can retain old URLs. Storage, operations and delivery contribute to usage; monitor your plan and usage. Uploads go through a Function and also contribute to its request/transfer usage.

### Verification

Theme normalization tests cover legacy compatibility, allowed colors/fonts/URLs and bounds. Upload tests cover fail-closed authentication, JPEG-to-WebP resizing, metadata removal and rejection of SVG/non-images. Browser checks use intercepted session responses (no production writes) to verify Save/reload, public display styles and desktop/mobile layouts. Actual relay publication and Blob writes require a configured deployment and were not exercised locally.
