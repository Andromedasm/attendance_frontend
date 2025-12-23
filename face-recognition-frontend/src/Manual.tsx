import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Sidebar from './Sidebar';

const HEADER_H = 84;

// manuals 保持不变（你原来的对象 그대로）
const manuals = {
  home: `
# ホームページ

Webアプリを起動した際に表示されるメインページです。

現在の時刻や日付、そしてシステムからのお知らせなどが表示されます。

画面下部（または指定の場所）にある **[打刻開始はこちら]** ボタンをタップまたはクリックすると、顔認証による出退勤打刻画面へスムーズに移動できます。
`,
  Sidebar: `
# サイドバーナビゲーション

画面左上に配置された **三本線のアイコン** をタップすることで、サイドバーの表示・非表示を切り替えることができます。

サイドバー内には、本アプリケーションの主要機能へアクセスするためのナビゲーションリンクが用意されています。

目的の項目を選択し、各機能ページへ移動してください。

---

**主なナビゲーション項目:**

*   **ホーム**: 初期ページへ戻ります。
*   **顔登録**: 新規に顔データを登録します。
*   **顔再登録**: 既存の顔データを更新します。
*   **マニュアル**: 現在ご覧いただいている操作説明です。
*   **出退勤打刻**: 日々の出勤・退勤を記録します。
`,
  顔登録: `
# 顔登録ガイド

初めて顔認証をご利用になる際に、ご自身の顔情報をシステムに登録するための手順です。

1.  **社員情報の確認**
    *   指定された入力欄に社員番号を入力してください。
    *   システムに登録されている社員名が自動的に表示されます。表示されたお名前が正しいことを必ずご確認ください。

2.  **カメラ準備**
    *   社員情報に問題がなければ、**[Start Video]** ボタンをクリックして、デバイスのカメラを起動します。
    *   カメラの使用許可を求められた場合は、許可してください。

3.  **撮影ポジションの調整**
    *   [x] カメラに対し**正面**を向き、顔全体が画面中央にバランス良く収まるようにしてください。
    *   [x] 明るい場所を選び、顔に影がかからないように注意しましょう。
    *   [x] 背景に他の人物の顔が映り込まないよう注意してください。

4.  **顔情報のキャプチャ**
    *   準備が整いましたら、**[登録開始]** ボタンをクリックします。
    *   顔情報がキャプチャされ、システムへの登録処理が開始されます。

登録処理が正常に完了すると、成功メッセージが表示されます。

万が一エラーが発生した場合は、メッセージに従い再度お試しいただくか、システム管理者にご連絡ください。
`,
  顔再登録: `
# 顔再登録ガイド

既に登録されているご自身の顔情報を更新（再登録）するための手順です。

顔認証の精度が低下した場合や、容姿に変化があった際などにご利用ください。

**重要：セキュリティに関するご注意**

*   顔情報の再登録操作を行うには、**管理者パスワードの入力が必要**です。パスワードがご不明な場合は、所属部署の管理職にご確認ください。
*   不正利用防止のため、再登録時に**新しい顔情報と以前の顔情報との類似度があまりにも低い場合**は、システムに操作日時、新しい顔写真のデータ、操作元のIPアドレス等が記録されます。あらかじめご了承ください。

**再登録手順:**

1.  **社員情報の確認**
    *   指定された入力欄に社員番号を入力してください。
    *   システムに登録されている社員名が自動的に表示されます。表示されたお名前が正しいことを必ずご確認ください。

2.  **カメラ準備**
    *   社員情報に問題がなければ、**[Start Video]** ボタンをクリックして、デバイスのカメラを起動します。
    *   カメラの使用許可を求められた場合は、許可してください。

3.  **撮影ポジションの調整**
    *   [x] カメラに対し**正面**を向き、顔全体が画面中央のガイド内にバランス良く収まるようにしてください。
    *   [x] 明るい場所を選び、顔に影がかからないように注意しましょう。
    *   [x] 背景に他の人物が映り込まないよう注意してください。

4.  **顔情報の再キャプチャと更新**
    *   準備が整いましたら、**[再登録開始]** ボタンをクリックします。
    *   新しい顔情報がキャプチャされ、既存の登録情報が更新されます。

再登録処理が正常に完了すると、成功メッセージが表示されます。

万が一エラーが発生した場合は、メッセージに従い再度お試しいただくか、システム管理者にご連絡ください。
`,
  顔認証: `
# 顔認証の利用方法

この機能では、登録済みの顔情報を使用して本人確認を行います。

**認証手順:**

1.  **カメラの起動**
    *   画面上の **[Start Video]** ボタンをクリックして、デバイスのカメラを起動してください。
    *   カメラの使用許可を求められた場合は、許可してください。

2.  **顔の撮影準備**
    *   [x] カメラに対し**正面**を向き、顔全体が画面中央のガイド内に収まるように調整してください。
    *   [x] 明るい場所で、顔に影がかからないように注意しましょう。
    *   [x] 背景に他の人物が映り込まないようにしてください。

3.  **認証の実行**
    *   準備が整いましたら、**[認証開始]** ボタンをクリックします。
    *   システムが自動的に顔を検出し、登録データとの照合を行います。

**認証結果:**

*   **認証成功時:**
    「認証に成功しました」というメッセージと共に、**ご自身の氏名が表示されます。**
*   **認証失敗時:**
    「認証に失敗しました」または「顔が一致しません」といったメッセージが表示されます。その場合は、以下の点をご確認の上、再度お試しください。
    *   顔の向きや位置は適切か。
    *   照明は十分か（暗すぎたり、逆光になっていないか）。
    *   カメラのレンズは清潔か。
    *   それでも失敗が続く場合は、システム管理者にご連絡ください。

> **ご注意**
> 認証精度に影響を与える可能性があるため、認証時は帽子やマスク、サングラスなどを外していただくことを推奨します。
`,
  出退勤: `
# 出退勤打刻

日々の出勤および退勤時刻を記録するための機能です。

**打刻モードの自動選択:**

*   出勤ボタンと退勤ボタンは、現在の時刻に基づいて、自動的に選択・強調表示されます。
*   午前中であれば「出勤」、午後15:00以降であれば「退勤」が自動選択されやすくなります。

**手動でのモード変更:**

*   自動選択された打刻モード（出勤/退勤）がご自身の意図と異なる場合は、ボタンを直接クリックすることで、手動でモードを切り替えることが可能です。
*   一度手動で打刻モードを変更すると、誤操作防止のため、その後15分間は打刻モードの自動選択機能が無効化されます。

**打刻手順:**

1.  **[Start Video]** ボタンをクリックしてカメラを起動します。
2.  打刻モード（出勤または退勤）が正しいことを確認します。
3.  [x] カメラに対し**正面**を向き、顔全体が画面中央に収まるように調整します。
4.  [x] 背景に他の人物が映り込まないよう注意してください。
5.  **[打刻開始]** ボタンをクリックします。

**打刻結果:**

*   顔認証が成功すると、打刻時刻、社員名などの情報がシステムに記録され、メッセージが表示されます。
*   既に同じモード（例：出勤）で打刻済みの場合、「すでに打刻されています」といったメッセージが表示されるます。
*   再度打刻操作を行うと「二重打刻」として扱われ、既存の記録を上書きするかどうかの確認を求められるます。画面の指示に従い、適切にご対応ください。
`,
};

const Manual: React.FC = () => {
  const [selected, setSelected] = useState<keyof typeof manuals>('home');

  const options = useMemo(() => Object.keys(manuals) as (keyof typeof manuals)[], []);

  return (
    <div className="h-dvh overflow-hidden bg-slate-100">
      <div className="flex h-dvh overflow-hidden">
        <Sidebar />

        <div className="flex-1 overflow-hidden">
          {/* 极简 header（左侧留汉堡按钮位） */}
          <header
            className="border-b border-black/5 bg-white/80 backdrop-blur"
            style={{ height: HEADER_H }}
          >
            <div className="flex h-full items-center justify-between px-6">
              <div className="w-16 shrink-0" aria-hidden="true" />
              <div />
            </div>
          </header>

          {/* main 负责滚动（防溢出） */}
          <main
            className="overflow-auto px-6 py-6"
            style={{ height: `calc(100dvh - ${HEADER_H}px)` }}
          >
            <div className="grid grid-cols-[360px_1fr] gap-6">
              {/* 左：选择器（做大、好点） */}
              <aside className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-black/5">
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value as keyof typeof manuals)}
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-lg font-semibold text-slate-900
                             shadow-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
                >
                  {options.map((key) => (
                    <option key={String(key)} value={key}>
                      {String(key)}
                    </option>
                  ))}
                </select>

                {/* 极少量提示文字（想更极简可删掉） */}
                <p className="mt-4 text-sm font-semibold text-slate-500">
                  画面左上のボタンでメニューを開けます
                </p>
              </aside>

              {/* 右：Markdown 内容（现代卡片 + typography） */}
              <article
                className={[
                  'rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-black/5',
                  'prose prose-slate max-w-none',
                  // iPad 横屏：字号更大、更易读
                  'prose-base lg:prose-lg',
                  'prose-headings:tracking-tight prose-headings:font-extrabold',
                  'prose-h1:border-b prose-h1:pb-3 prose-h1:border-slate-200',
                  'prose-h2:border-b prose-h2:pb-2 prose-h2:border-slate-200',
                  'prose-a:text-blue-600 hover:prose-a:text-blue-700',
                  'prose-strong:text-slate-900',
                  'prose-li:my-1',
                  'prose-table:table-auto',
                  'prose-th:bg-slate-50',
                  'prose-th:font-bold',
                  'prose-th:border prose-td:border prose-th:border-slate-200 prose-td:border-slate-200',
                  'prose-th:p-2 prose-td:p-2',
                  'leading-relaxed',
                ].join(' ')}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{manuals[selected]}</ReactMarkdown>
              </article>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default Manual;
