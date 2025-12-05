
import React, { useState } from 'react';
import { isTrialValid, isAuthValid, getAuthInfo } from '../utils/authUtils';
import AuthCodeModal from './AuthCodeModal';

const InfoPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const auth = getAuthInfo();

  let status = '';
  let expireText = '';
  if (isAuthValid()) {
    const auth = getAuthInfo();
    if (auth) {
      const expireDate = new Date(auth.date + 365 * 24 * 60 * 60 * 1000);
      const y = expireDate.getFullYear();
      const m = String(expireDate.getMonth() + 1).padStart(2, '0');
      const d = String(expireDate.getDate()).padStart(2, '0');
      expireText = `已激活至${y}-${m}-${d}`;
    } else {
      expireText = '已激活';
    }
    status = 'activated';
  } else if (isTrialValid()) {
    status = '试用中';
  } else {
    status = '未激活';
  }

  const handleStatusClick = () => {
    if (!isAuthValid()) setShowAuthModal(true);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-sm w-full text-center">
        <div className="mb-4 text-gray-700 space-y-2">
          <div style={{marginBottom: '1.5em', textAlign: 'justify'}}>
            <br />
            &emsp;&emsp;本应用基于艾宾浩斯记忆遗忘曲线理论设计复习时点，帮助用户在90天内的关键时间点进行高效复习。
            <br />
          </div>
          <div>版本：1.5</div>
          <div>
            使用期限：
            <span
              className={
                status === '未激活'
                  ? 'text-red-500 underline cursor-pointer'
                  : status === '试用中'
                  ? 'text-yellow-600 underline cursor-pointer'
                  : 'text-green-600'
              }
              onClick={handleStatusClick}
              title={status === 'activated' && getAuthInfo() ? `授权码：${getAuthInfo()?.code}` : '点击输入授权码'}
            >
              {status === 'activated' ? expireText : status}
            </span>
          </div>
          <div>电邮：zero14@qq.com</div>
          <div style={{marginTop: '1em', wordWrap: 'break-word', overflow: 'hidden'}}>
            详细使用说明查看微信公众号 @肆张Pakhoi<br />
            <br />
            或者小报童专栏文章<br />
            <a
              href="https://xiaobot.net/post/13c235eb-6a1d-4c95-8192-9739f578f8ef"
              target="_blank"
              rel="noopener noreferrer"
              style={{ 
                color: '#2563eb', 
                textDecoration: 'underline',
                wordBreak: 'break-all',
                lineHeight: '1.4'
              }}
            >
              https://xiaobot.net/post/13c235eb-6a1d-4c95-8192-9739f578f8ef
            </a>
          </div>
        </div>
        <button
          className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          onClick={onBack}
        >
          返回
        </button>
        {showAuthModal && (
          <AuthCodeModal
            onSuccess={() => {
              setShowAuthModal(false);
              window.location.reload();
            }}
            onClose={() => setShowAuthModal(false)}
          />
        )}
      </div>
    </div>
  );
};

export default InfoPage;
