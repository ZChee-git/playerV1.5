import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipForward, SkipBack, X, AlertCircle } from 'lucide-react';
import { PlaylistItem, VideoFile } from '../types';
import { getVideoPlayProgress, saveVideoPlayProgress, clearVideoPlayProgress } from '../utils/authUtils';

interface VideoPlayerProps {
  playlist: PlaylistItem[];
  videos: VideoFile[];
  onClose: () => void;
  onPlaylistComplete: () => void;
  initialIndex?: number;
  isAudioMode?: boolean;
  onFileMissing?: (videoId: string) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  playlist,
  videos,
  onClose,
  onPlaylistComplete,
  initialIndex = 0,
  isAudioMode = false,
  onFileMissing,
}) => {
  const [missingNotice, setMissingNotice] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoError, setVideoError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [userInteracted, setUserInteracted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [controlsTimeout, setControlsTimeout] = useState<number | null>(null);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [resumeTime, setResumeTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSaveTimeRef = useRef<number>(0);

  const currentItem = playlist[currentIndex];
  const currentVideo = videos.find(v => v.id === currentItem?.videoId);
  const derivedAudioMode = currentVideo?.mediaType === 'audio';
  const audioOnlyMode = isAudioMode || derivedAudioMode;

  // 检测设备和浏览器
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

  // 监听用户交互
  useEffect(() => {
    const handleUserInteraction = () => {
      setUserInteracted(true);
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('click', handleUserInteraction);
    };

    document.addEventListener('touchstart', handleUserInteraction);
    document.addEventListener('click', handleUserInteraction);

    return () => {
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('click', handleUserInteraction);
    };
  }, []);


  // 控制栏自动隐藏逻辑（音频模式下不隐藏）
  const hideControlsAfterDelay = () => {
    if (audioOnlyMode) {
      setShowControls(true);
      return;
    }
    if (controlsTimeout) {
      clearTimeout(controlsTimeout);
    }
    const timeout = setTimeout(() => {
      setShowControls(false);
    }, 3000); // 3秒后隐藏
    setControlsTimeout(timeout);
  };

  const showControlsTemporarily = () => {
    setShowControls(true);
    if (!audioOnlyMode) {
      hideControlsAfterDelay();
    }
  };

  // 视频加载和事件处理
  useEffect(() => {
    if (videoRef.current && currentVideo) {
      setVideoError(false);
      setIsLoading(true);
      setRetryCount(0);
      // 不在这里重置恢复提示状态，让 handleLoadedMetadata 来处理
      
      const video = videoRef.current;
      video.src = '';
      video.load();
      video.src = currentVideo.fileUrl;
      
      if (audioOnlyMode) {
        video.style.display = 'none';
      } else {
        video.style.display = 'block';
      }
      
      if (isIOS && isSafari) {
        video.playsInline = true;
        video.muted = false;
        video.preload = 'auto';
      } else {
        video.preload = 'metadata';
      }
      
      const handleLoadedMetadata = () => {
        setDuration(video.duration);
        
        // 重置保存时间计时器
        lastSaveTimeRef.current = 0;
        
        // 检查是否有播放进度需要恢复
        const savedProgress = getVideoPlayProgress(currentVideo.id);
        console.log(`[断点续播] 视频 ${currentVideo.name}:`, {
          videoId: currentVideo.id,
          savedProgress,
          duration: video.duration,
          shouldShow: savedProgress > 10 && savedProgress < video.duration - 10
        });
        
        if (savedProgress > 10 && savedProgress < video.duration - 10) { // 至少播放了10秒且不在最后10秒
          setResumeTime(savedProgress);
          setShowResumePrompt(true);
          console.log(`[断点续播] 显示恢复提示，时间: ${savedProgress}秒`);
        } else {
          setShowResumePrompt(false);
          setResumeTime(0);
          console.log(`[断点续播] 不显示恢复提示`);
        }
      };

      const handleCanPlay = () => {
        if (userInteracted) {
          setTimeout(() => {
            setIsLoading(false);
            if (currentIndex >= initialIndex) {
              video.play().catch(console.error);
            }
          }, isIOS ? 100 : 500);
        } else {
          setIsLoading(false);
        }
      };

      const handleError = (e: any) => {
        console.error('Video error:', e);
        setIsLoading(false);

        if (currentVideo) {
          try {
            onFileMissing && onFileMissing(currentVideo.id);
          } catch (err) {
            console.error('onFileMissing handler failed', err);
          }
          setMissingNotice('视频文件未找到，已跳过');
          setTimeout(() => {
            setMissingNotice(null);
            goToNext();
          }, 1400);
        } else {
          setVideoError(true);
        }
      };

      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('error', handleError);

      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('error', handleError);
      };
    }
  }, [currentIndex, currentVideo, audioOnlyMode, userInteracted, initialIndex]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      showControlsTemporarily();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seekTime = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = seekTime;
      setCurrentTime(seekTime);
    }
    showControlsTemporarily();
  };

  const handleTimeUpdate = () => {
    if (videoRef.current && currentVideo) {
      const currentTime = videoRef.current.currentTime;
      setCurrentTime(currentTime);
      
      // 使用时间间隔保存播放进度，避免依赖精确的整数秒
      const now = Date.now();
      if (!lastSaveTimeRef.current || now - lastSaveTimeRef.current >= 5000) { // 每5秒保存一次
        if (currentTime > 0) {
          saveVideoPlayProgress(currentVideo.id, currentVideo.name, currentTime);
          lastSaveTimeRef.current = now;
          console.log(`[断点续播] 保存播放进度: ${currentVideo.name} -> ${currentTime.toFixed(1)}秒`);
        }
      }
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const resumePlayback = () => {
    if (videoRef.current && resumeTime > 0) {
      videoRef.current.currentTime = resumeTime;
      setCurrentTime(resumeTime);
      console.log(`[断点续播] 恢复播放至: ${resumeTime.toFixed(1)}秒`);
    }
    setShowResumePrompt(false);
    showControlsTemporarily();
  };

  const startFromBeginning = () => {
    if (currentVideo) {
      clearVideoPlayProgress(currentVideo.id);
      console.log(`[断点续播] 从头开始播放，清除进度记录`);
    }
    setShowResumePrompt(false);
    showControlsTemporarily();
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
    showControlsTemporarily();
  };

  const goToNext = () => {
    // 清除当前视频的播放进度
    if (currentVideo) {
      clearVideoPlayProgress(currentVideo.id);
    }
    
    if (currentIndex < playlist.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onPlaylistComplete();
    }
    showControlsTemporarily();
  };

  const handleVideoEnded = () => {
    // 清除当前视频的播放进度（播放完成）
    if (currentVideo) {
      clearVideoPlayProgress(currentVideo.id);
    }
    
    if (currentIndex < playlist.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onPlaylistComplete();
    }
  };

  const retryVideo = () => {
    if (retryCount < 3) {
      setRetryCount(retryCount + 1);
      setVideoError(false);
      setIsLoading(true);
      if (videoRef.current && currentVideo) {
        videoRef.current.src = currentVideo.fileUrl;
        videoRef.current.load();
      }
    }
    showControlsTemporarily();
  };

  if (!currentVideo) {
    // 清除本地未完成的新学习播放列表
    const playlistsRaw = window.localStorage.getItem('playlists');
    if (playlistsRaw) {
      try {
        const playlists = JSON.parse(playlistsRaw);
        const filtered = playlists.filter((p:any) => p.isCompleted || p.playlistType !== 'new');
        window.localStorage.setItem('playlists', JSON.stringify(filtered));
      } catch (e) {
        // ignore
      }
    }
    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 text-center max-w-sm mx-4">
          <p className="text-xl text-gray-800 mb-4">视频文件未找到</p>
          <button
            onClick={onClose}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg"
          >
            关闭
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
      <div className="relative w-full h-full">
        {/* Video/Audio Display */}
        {videoError ? (
          <div className="w-full h-full bg-gray-800 flex items-center justify-center">
            <div className="text-center text-white p-4">
              <AlertCircle size={48} className="mx-auto mb-4 text-red-400" />
              <p className="text-lg mb-2">视频加载失败</p>
              <p className="text-sm text-gray-300 mb-4">
                重试次数: {retryCount}/3
              </p>
              <div className="space-y-2">
                <button
                  onClick={retryVideo}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg mr-2"
                  disabled={retryCount >= 3}
                >
                  {retryCount >= 3 ? '重试次数已用完' : '重试'}
                </button>
                <button
                  onClick={goToNext}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
                  disabled={currentIndex >= playlist.length - 1}
                >
                  跳过此视频
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {isLoading && (
              <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10">
                <div className="text-white text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                  <p>正在加载视频...</p>
                </div>
              </div>
            )}
            
            {/* transient missing-file notice */}
            {missingNotice && (
              <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-50 bg-yellow-400 text-black px-4 py-2 rounded shadow">
                {missingNotice}
              </div>
            )}

            {/* 断点续播提示 */}
            {showResumePrompt && (
              <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-20">
                <div className="bg-white rounded-lg p-6 max-w-md mx-4 text-center">
                  <h3 className="text-lg font-semibold mb-4 text-gray-800">断点续播</h3>
                  <p className="text-gray-600 mb-6">
                    检测到上次播放进度：{formatTime(resumeTime)}
                  </p>
                  <div className="flex space-x-4">
                    <button
                      onClick={resumePlayback}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
                    >
                      继续播放
                    </button>
                    <button
                      onClick={startFromBeginning}
                      className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium"
                    >
                      从头开始
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* 音频模式显示 */}
            {audioOnlyMode && (
              <div
                className="w-full h-full bg-gradient-to-br from-yellow-900 to-yellow-700 flex items-center justify-center"
                onClick={showControlsTemporarily}
                onTouchStart={showControlsTemporarily}
              >
                <div
                  className="text-center text-white p-8"
                  onClick={showControlsTemporarily}
                  onTouchStart={showControlsTemporarily}
                >
                  <div className="text-6xl mb-6">🎵</div>
                  <h2 className="text-2xl font-bold mb-2">{currentVideo.name}</h2>
                  <p className="text-yellow-200 mb-4">音频复习模式</p>
                </div>
              </div>
            )}
            
            <video
              ref={videoRef}
              className={`w-full h-full bg-black ${audioOnlyMode ? 'hidden' : 'block'}`}
              onPlay={() => {
                setIsPlaying(true);
                hideControlsAfterDelay();
              }}
              onPause={() => {
                setIsPlaying(false);
                setShowControls(true);
                if (controlsTimeout) {
                  clearTimeout(controlsTimeout);
                }
              }}
              onEnded={handleVideoEnded}
              onTimeUpdate={handleTimeUpdate}
              onClick={showControlsTemporarily}
              onTouchStart={showControlsTemporarily}
              playsInline={true}
              controls={false}
              style={{ objectFit: 'contain' }}
            />
          </>
        )}
        
        {/* Controls Overlay - 只在需要时显示 */}
        {!videoError && (showControls || audioOnlyMode) && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
            {/* Progress Bar */}
            <div className="mb-6">
              <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="flex justify-between text-white text-sm mt-2">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
            
            {/* Control Buttons - 3倍大小 */}
            <div className="flex items-center justify-center space-x-8">
              <button
                onClick={goToPrevious}
                disabled={currentIndex === 0}
                className="text-white p-4 rounded-full hover:bg-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <SkipBack size={54} />
              </button>
              
              <button
                onClick={togglePlay}
                className="bg-white/20 text-white p-6 rounded-full hover:bg-white/30 transition-all"
                disabled={isLoading}
              >
                {isPlaying ? <Pause size={60} /> : <Play size={60} />}
              </button>
              
              <button
                onClick={goToNext}
                disabled={currentIndex === playlist.length - 1}
                className="text-white p-4 rounded-full hover:bg-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <SkipForward size={54} />
              </button>
              
              <button
                onClick={onClose}
                className="text-white p-4 rounded-full hover:bg-white/20 transition-all"
              >
                <X size={54} />
              </button>
            </div>
          </div>
        )}
      </div>
      
      <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
        }
        
        .slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
};
