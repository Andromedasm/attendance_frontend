import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import Sidebar from './Sidebar';

// 示例：把多个功能说明存成一个对象
const manuals = {
    home: `
# ホームページ

アプリを起動すると表示されるトップページです。  
現在の時刻や日付などが表示されます。  

[打刻開始はこちら] ボタンをクリックすると、打刻画面に移動します。
`,
    sidebar: `
# サイドバー

左上の三本線のメニューボタンを押すと、サイドバーが開きます。  
もう一度押すと、サイドバーが閉じます。  
サイドバー内のボタンを押すと、対応するページに移動します。
`,
    register: `
# 顔登録

初めて顔情報を登録する機能です。  
社員番号を入力すると、社員名が自動的に反映されます。社員名が正しいことを確認してください。

問題がなければ [Start Video] ボタンをクリックし、カメラを起動します。  
正面を向き、顔を画面の中央に配置してください。背景に他の人の顔が映らないようにしてください。

[登録開始] ボタンをクリックすると、登録が開始されます。  
登録が完了すると、完了メッセージが表示されます。
`,
    reregister: `
# 顔再登録

既存の顔データを再登録（更新）する機能です。  
再登録が必要な場合に、社員番号を入力すると、社員名が自動的に反映されます。社員名が正しいことを確認してください。

問題がなければ [Start Video] ボタンをクリックし、カメラを起動します。  
正面を向き、顔を画面の中央に配置してください。背景に他の人の顔が映らないようにしてください。

[再登録開始] ボタンをクリックすると、登録が開始されます。  
登録が完了すると、完了メッセージが表示されます。
`,
    verify: `
# 顔認証

/verify 画面で登録済みの顔データと照合します。  
カメラを起動し、認証成功/失敗が表示されます。
`,
    liveness: `
# ライブネスチェック

/liveness 画面で、静止画像や動画を用いたなりすましを防ぐ機能です。  
顔を動かすなど、一定の動作検知によって本物の人間か確認します。
`,
    attendance: `
# 出退勤

/attendance 画面で出勤/退勤の打刻を行います。  
「Start Video」を押してカメラを起動し、「出勤」または「退勤」を選択して記録してください。  
成功すると日時と社員名などが保存されます。
`
};

const Manual: React.FC = () => {
    // 用一个状态来存储当前选中的功能
    const [selected, setSelected] = useState<keyof typeof manuals>('home');

    // 当用户在下拉框中选择不同功能时，更新状态
    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newVal = e.target.value as keyof typeof manuals;
        setSelected(newVal);
    };

    return (
        <div className="flex h-screen bg-gray-200">
            <Sidebar />

            {/* 内容区：在右侧 */}
            <div className="flex-1 p-10 overflow-auto">
                {/* 下拉选择框来切换使用说明 */}
                <div className="mb-6">
                    <label className="font-bold mr-4">マニュアルを選択：</label>
                    <select
                        value={selected}
                        onChange={handleChange}
                        className="border border-gray-300 rounded p-2"
                    >
                        <option value="home">ホームページ</option>
                        <option value="sidebar">サイドバー</option>
                        <option value="register">顔登録</option>
                        <option value="reregister">顔再登録</option>
                        <option value="verify">顔認証</option>
                        <option value="liveness">ライブネスチェック</option>
                        <option value="attendance">出退勤</option>
                    </select>
                </div>

                {/* 用 ReactMarkdown 渲染选中的那段文本 */}
                {/*
            解决文字看不清：
            1) 外层加 text-black 确保文字是黑色
            2) 加 .prose 来让 Markdown 标题正常显示大字(需Tailwind Typography插件)
            3) leading-relaxed 使行间距更舒适
        */}
                <div className="bg-white shadow-lg p-6 rounded text-black prose leading-relaxed">
                    <ReactMarkdown>{manuals[selected]}</ReactMarkdown>
                </div>
            </div>
        </div>
    );
};

export default Manual;
