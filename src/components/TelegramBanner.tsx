import React from 'react';

export const TelegramBanner = () => {
  return (
    <div className="w-full max-w-4xl mx-auto my-12 group">
      <div className="relative overflow-hidden p-1 rounded-2xl bg-gradient-to-r from-blue-400 via-cyan-400 to-sky-500 shadow-xl transition-transform transform hover:-translate-y-1 hover:shadow-2xl">
        <div className="absolute inset-0 bg-white/30 opacity-0 group-hover:opacity-20 transition-opacity"></div>
        <div className="relative flex flex-col md:flex-row items-center justify-between p-8 bg-white rounded-xl">
          
          <div className="flex items-center gap-6 mb-6 md:mb-0">
            {/* Animated Icon */}
            <div className="w-16 h-16 flex-shrink-0 bg-sky-100 text-sky-600 rounded-full flex items-center justify-center text-3xl shadow-inner">
              <svg className="w-8 h-8 transform -rotate-12 group-hover:rotate-0 transition-transform duration-300" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.28l15.93-6.15c.73-.27 1.37.16 1.14 1.13l-2.71 12.8c-.2.92-1.23 1.15-2.02.72l-5.5-4.04-2.65 2.53c-.29.29-.53.54-1.09.54z"/>
              </svg>
            </div>
            <div className="text-center md:text-left">
              <h3 className="text-2xl font-bold text-gray-800">Community Support</h3>
              <p className="text-gray-500 font-medium">Join 5,000+ developers on Telegram</p>
            </div>
          </div>

          <a
            href="https://t.me/CyberCoderBD"
            target="_blank"
            rel="noopener noreferrer"
            className="px-8 py-3 bg-[#229ED9] hover:bg-[#1CA0D6] text-white text-lg font-bold rounded-full shadow-lg shadow-blue-200 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
          >
            <span>Join Now</span>
            <span className="text-xl">→</span>
          </a>
        </div>
      </div>
    </div>
  );
};
