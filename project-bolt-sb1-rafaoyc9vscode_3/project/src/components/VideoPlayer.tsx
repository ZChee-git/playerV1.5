import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipForward, SkipBack, X, AlertCircle } from 'lucide-react';
import type { PlaylistItem, VideoFile } from '../types';
import { getVideoPlayProgress, saveVideoPlayProgress, clearVideoPlayProgress } from '../utils/authUtils';

interface VideoPlayerProps {
  playlist: PlaylistItem[];
  videos: VideoFile[];
  onClose: () => void;
  onPlaylistComplete: () => void;
  initialIndex?: number;
  isAudioMode?: boolean; // 是否为音频模式
  onProgressUpdate?: (index: number) => void; // 断点续播进度回传
  onFileMissing?: (videoId: string) => void; // 文件缺失时通知上层删除记录
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  playlist,
  videos,
  onClose,
  onPlaylistComplete,
  initialIndex = 0,
  isAudioMode = false,
  onProgressUpdate,
  onFileMissing,
}) => {
  const [missingNotice, setMissingNotice] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // 每次 currentIndex 变化时，回传进度
  useEffect(() => {
    if (onProgressUpdate) {
      onProgressUpdate(currentIndex);
    }
  }, [currentIndex, onProgressUpdate]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoError, setVideoError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  const currentItem = playlist[currentIndex];
  const currentVideo = videos.find(v => v.id === currentItem?.videoId);
  const derivedAudioMode = currentVideo?.mediaType === 'audio';
  const [audioOnlyMode] = useState(isAudioMode || derivedAudioMode);

  const [userInteracted, setUserInteracted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [controlsTimeout, setControlsTimeout] = useState<number | null>(null);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [resumeTime, setResumeTime] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSaveTimeRef = useRef<number>(0);
  const errorHandledRef = useRef(false); // 防止 error 多次触发

  // 使用 useRef 来避免 autoPlay 状态导致的重新渲染
  const autoPlayRef = useRef(true);

  // 检测设备和浏览器
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

  // 监听用户交互（为了解决自动播放限制）
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

  // 如果 playlist 当前有项，但 videos 里找不到对应视频：自动提示并跳到下一个
  useEffect(() => {
    if (!currentItem) return; // 播放列表为空，什么也不做
    if (!currentVideo) {
      setMissingNotice('视频文件未找到，已跳过');
      const timer = window.setTimeout(() => {
        setMissingNotice(null);
        // 到达最后一个就直接触发播放完成
        if (currentIndex < playlist.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else {
          onPlaylistComplete();
        }
      }, 1400);
      return () => window.clearTimeout(timer);
    }
  }, [currentItem, currentVideo, currentIndex, playlist.length, onPlaylistComplete]);

  // 切换视频时设置 video 元素和断点续播
  useEffect(() => {
    if (videoRef.current && currentVideo) {
      const video = videoRef.current;

      setVideoError(false);
      setIsLoading(true);
      setRetryCount(0);
      errorHandledRef.current = false; // 新视频重置错误处理标记

      // 重置视频元素
      video.src = '';
      video.load();

      // 设置新的视频源
      video.src = (currentVideo as any).fileUrl;

      // 音频模式设置
      if (audioOnlyMode) {
        video.style.display = 'none';
      } else {
        video.style.display = 'block';
      }

      // iOS Safari 特殊设置
      if (isIOS && isSafari) {
        video.playsInline = true;
        video.muted = false; // iOS Safari 不需要静音来自动播放
        video.preload = 'auto'; // iOS 使用 auto 预加载
      } else {
        video.preload = 'metadata';
      }

      const handleLoadedMetadata = () => {
        setIsLoading(false);
        setDuration(video.duration);

        // 重置保存时间计时器
        lastSaveTimeRef.current = 0;

        // 检查是否有播放进度需要恢复
        const savedProgress = getVideoPlayProgress(currentVideo.id);
        if (savedProgress > 10 && savedProgress < video.duration - 10) {
          setResumeTime(savedProgress);
          setShowResumePrompt(true);
        } else {
          setShowResumePrompt(false);
          setResumeTime(0);
        }
      };

      const handleCanPlay = () => {
        setIsLoading(false);
        setVideoError(false);

        // 自动播放逻辑
        if (autoPlayRef.current && currentIndex >= initialIndex && userInteracted) {
          setTimeout(() => {
            if (!videoError && video.readyState >= 2) {
              const playPromise = video.play();
              if (playPromise !== undefined) {
                playPromise
                  .then(() => {
                    console.log('Auto-play successful');
                  })
                  .catch(error => {
                    console.log('Auto-play failed, user interaction required:', error);
                    // iOS Safari 自动播放失败是正常的，不显示错误
                    if (!isIOS) {
                      setIsLoading(false);
                    }
                  });
              }
            }
          }, isIOS ? 100 : 500); // iOS 使用更短的延迟
        } else {
          setIsLoading(false);
        }
      };

      const handleError = (e: any) => {
        if (errorHandledRef.current) return;
        errorHandledRef.current = true;

        console.error('Video error:', e);
        setIsLoading(false);

        if (currentVideo) {
          // 通知父组件删除记录（非物理删除）
          try {
            onFileMissing && onFileMissing(currentVideo.id);
          } catch (err) {
            console.error('onFileMissing handler failed', err);
          }

          // 短暂提示并自动跳到下一个
          setMissingNotice('视频文件未找到，已跳过');
          setTimeout(() => {
            setMissingNotice(null);
            // 使用统一的跳转逻辑
            if (currentIndex < playlist.length - 1) {
              setCurrentIndex(currentIndex + 1);
            } else {
              onPlaylistComplete();
            }
          }, 1400);
        } else {
          // 极端情况下的兜底
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
  }, [
    currentIndex,
    currentVideo,
    audioOnlyMode,
    userInteracted,
    initialIndex,
    isIOS,
    isSafari,
    videoError,
    onFileMissing,
    playlist.length,
    onPlaylistComplete,
  ]);

  // 控制栏自动隐藏逻辑
  const hideControlsAfterDelay = () => {
    if (audioOnlyMode) {
      if (controlsTimeout) {
        clearTimeout(controlsTimeout);
      }
      setShowControls(true);
      return;
    }
    if (controlsTimeout) {
      clearTimeout(controlsTimeout);
    }
    const timeout = window.setTimeout(() => {
      setShowControls(false);
    }, 3000); // 3秒后隐藏
    setControlsTimeout(timeout);
  };

  const showControlsTemporarily = () => {
    setShowControls(true);
    hideControlsAfterDelay();
  };

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

  const handleTimeUpdate = () => {
    if (videoRef.current && currentVideo) {
      const ct = videoRef.current.currentTime;
      setCurrentTime(ct);

      // 使用时间间隔保存播放进度，避免依赖精确的整数秒
      const now = Date.now();
      if (!lastSaveTimeRef.current || now - lastSaveTimeRef.current >= 5000) {
        if (ct > 0) {
          saveVideoPlayProgress(currentVideo.id, currentVideo.name, ct);
          lastSaveTimeRef.current = now;
        }
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  // 前进/后退与时间格式化函数
  const goToNext = () => {
    // 清除当前视频的播放进度
    if (currentVideo) {
      clearVideoPlayProgress(currentVideo.id);
    }

    if (currentIndex < playlist.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsPlaying(false);
      setVideoError(false);
    } else {
      onPlaylistComplete();
    }
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsPlaying(false);
      setVideoError(false);
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
    }
    setShowResumePrompt(false);
    showControlsTemporarily();
  };

  const startFromBeginning = () => {
    if (currentVideo) {
      clearVideoPlayProgress(currentVideo.id);
    }
    setShowResumePrompt(false);
    showControlsTemporarily();
  };

  const handleVideoEnded = () => {
    // 清除当前视频的播放进度（播放完成）
    if (currentVideo) {
      clearVideoPlayProgress(currentVideo.id);
    }

    if (autoPlayRef.current && currentIndex < playlist.length - 1) {
      goToNext();
    } else if (currentIndex >= playlist.length - 1) {
      onPlaylistComplete();
    }
  };

  const retryVideo = () => {
    if (retryCount < 3) {
      setRetryCount(prev => prev + 1);
      setVideoError(false);
      setIsLoading(true);

      if (videoRef.current && currentVideo) {
        const video = videoRef.current;
        video.src = '';
        video.load();
        video.src = (currentVideo as any).fileUrl;

        setTimeout(() => {
          if (video.readyState >= 2) {
            const playPromise = video.play();
            if (playPromise !== undefined) {
              playPromise.catch(error => {
                console.error('Retry play failed:', error);
                setVideoError(true);
                setIsLoading(false);
              });
            }
          }
        }, 1000);
      }
    } else {
      alert('视频加载失败次数过多，请检查文件是否损坏');
    }
  };

  const handleClose = () => {
    if (window.history.length > 1) {
      window.history.pushState(null, '', window.location.href);
    }
    onClose();
  };

  // 监听浏览器返回按钮
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      onClose();
    };

    window.history.pushState({ modal: 'video-player' }, '', window.location.href);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [onClose]);

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
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
                  <p>正在加载视频...</p>
                </div>
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
            {audioOnlyMode && currentVideo && (
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
              style= objectFit: 'contain' 
            />
          </>
        )}

        {/* Transient missing-file notice (非阻塞提示） */}
        {missingNotice && (
          <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-50 bg-yellow-400 text-black px-4 py-2 rounded shadow">
            {missingNotice}
          </div>
        )}

        {/* Controls Overlay - 音频模式下常显 */}
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

            {/* Control Buttons */}
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
                className="text-white p-4 rounded-full hover:bg白/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <SkipForward size={54} />
              </button>

              <button
                onClick={handleClose}
                className="text-white p-4 rounded-full hover:bg-white/20 transition-all"
              >
                <X size={54} />
              </button>
            </div>
          </div>
        )}

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
    </div>
  );
};
