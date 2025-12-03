import { useState, useEffect } from 'react';
import { VideoFile, DailyPlaylist, PlaylistItem, LearningStats, PlaylistPreview, Collection } from '../types';
import { 
  useLocalStorage, 
  serializeVideoFile, 
  deserializeVideoFile,
  serializeCollection,
  deserializeCollection,
  serializePlaylist,
  deserializePlaylist,
  fileStorage
} from './useLocalStorage';

export const usePlaylistManager = () => {
  // 使用本地存储
  const [storedVideos, setStoredVideos] = useLocalStorage<any[]>('videos', []);
  const [storedPlaylists, setStoredPlaylists] = useLocalStorage<any[]>('playlists', []);
  const [storedCollections, setStoredCollections] = useLocalStorage<any[]>('collections', []);

  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [playlists, setPlaylists] = useState<DailyPlaylist[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 新复习间隔：第1、4、7、15、30、90天（第一次复习为明天）
  const REVIEW_INTERVALS = [1, 4, 7, 15, 30, 90];
  const MAX_NEW_PER_DAY = 4; // 每日新学习数量改为4集
  const MAX_REVIEW_PER_DAY = 600; // 每日最大复习数量，已由6改为600

  // 初始化数据
  useEffect(() => {
    const initializeData = async () => {
      try {
        // 初始化文件存储
        await fileStorage.init();
        
        // 恢复合辑数据
        const restoredCollections = storedCollections.map(deserializeCollection);
        setCollections(restoredCollections);

        // 恢复播放列表数据
        const restoredPlaylists = storedPlaylists.map(deserializePlaylist);
        setPlaylists(restoredPlaylists);

        // 恢复视频数据
        const restoredVideos = await Promise.all(
          storedVideos.map(async (video) => {
            const restored = deserializeVideoFile(video);
            // 从 IndexedDB 恢复文件URL
            try {
              const fileUrl = await fileStorage.getFile(video.id);
              if (fileUrl) {
                restored.fileUrl = fileUrl;
              }
            } catch (error) {
              console.error('Error restoring file for video:', video.id, error);
            }
            return restored;
          })
        );
        setVideos(restoredVideos);
      } catch (error) {
        console.error('Error initializing data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeData();
  }, []);

  // 保存数据到本地存储

  useEffect(() => {
    if (!isLoading) {
      const serializedVideos = videos.map(serializeVideoFile);
      setStoredVideos(serializedVideos);
    }
  }, [videos, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      const serializedPlaylists = playlists.map(serializePlaylist);
      setStoredPlaylists(serializedPlaylists);
    }
  }, [playlists, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      const serializedCollections = collections.map(serializeCollection);
      setStoredCollections(serializedCollections);
    }
  }, [collections, isLoading]);

  // 生成随机颜色
  const generateRandomColor = () => {
    const colors = [
      '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', 
      '#EF4444', '#06B6D4', '#84CC16', '#F97316'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  // 生成UUID的兼容函数
  const generateUUID = () => {
    // 检查是否支持crypto.randomUUID
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // 降级方案
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const createCollection = (name: string, description?: string) => {
    console.log('Creating collection:', name, description); // 调试日志
    
    const newCollection: Collection = {
      id: generateUUID(),
      name,
      description,
      dateCreated: new Date(),
      isActive: true,
      totalVideos: 0,
      completedVideos: 0,
      color: generateRandomColor(),
    };

    console.log('New collection created:', newCollection); // 调试日志
    
    setCollections(prev => {
      const updated = [...prev, newCollection];
      console.log('Updated collections:', updated); // 调试日志
      return updated;
    });
    
    return newCollection.id;
  };

  const updateCollection = (collectionId: string, name: string, description?: string) => {
    setCollections(prev => prev.map(collection => 
      collection.id === collectionId 
        ? { ...collection, name, description }
        : collection
    ));
  };

  const deleteCollection = async (collectionId: string) => {
    // 删除合辑中的所有视频文件
    const collectionVideos = videos.filter(v => v.collectionId === collectionId);
    
    // 清理文件存储
    await Promise.all(
      collectionVideos.map(async (video) => {
        try {
          if (video.fileUrl) {
            URL.revokeObjectURL(video.fileUrl);
          }
          await fileStorage.deleteFile(video.id);
        } catch (error) {
          console.error('Error deleting file for video:', video.id, error);
        }
      })
    );
    
    setVideos(prev => prev.filter(v => v.collectionId !== collectionId));
    setCollections(prev => prev.filter(c => c.id !== collectionId));
  };

  const toggleCollection = (collectionId: string) => {
    setCollections(prev => prev.map(collection => 
      collection.id === collectionId 
        ? { ...collection, isActive: !collection.isActive }
        : collection
    ));
  };

  const addVideos = async (files: File[], collectionId: string) => {
    console.log('usePlaylistManager: addVideos 开始', { filesCount: files.length, collectionId });
    
    try {
      const newVideos: VideoFile[] = await Promise.all(
        files.map(async (file, index) => {
          console.log(`usePlaylistManager: 处理文件 ${index + 1}/${files.length}:`, file.name);
          
          const id = generateUUID(); // 使用我们的兼容函数
          
          try {
            // 保存文件到 IndexedDB 并获取 URL
            console.log(`usePlaylistManager: 开始保存文件到 IndexedDB:`, file.name);
            const fileUrl = await fileStorage.saveFile(id, file);
            console.log(`usePlaylistManager: 文件保存成功:`, { fileName: file.name, fileUrl });
            
            return {
              id,
              name: file.name.replace(/\.[^/.]+$/, ""),
              file,
              fileUrl,
              dateAdded: new Date(),
              reviewCount: 0,
              status: 'new' as const,
              collectionId,
              episodeNumber: index + 1,
            };
          } catch (error) {
            console.error('usePlaylistManager: 保存文件到 IndexedDB 失败:', file.name, error);
            // 如果保存失败，使用临时 URL
            const fallbackUrl = URL.createObjectURL(file);
            console.log(`usePlaylistManager: 使用临时 URL 作为后备:`, { fileName: file.name, fallbackUrl });
            
            return {
              id,
              name: file.name.replace(/\.[^/.]+$/, ""),
              file,
              fileUrl: fallbackUrl,
              dateAdded: new Date(),
              reviewCount: 0,
              status: 'new' as const,
              collectionId,
              episodeNumber: index + 1,
            };
          }
        })
      );

      console.log('usePlaylistManager: 所有文件处理完成，添加到视频列表', newVideos.length);
      setVideos(prev => [...prev, ...newVideos]);
      
      // 更新合辑统计
      console.log('usePlaylistManager: 更新合辑统计', { collectionId, videoCount: newVideos.length });
      setCollections(prev => prev.map(collection => 
        collection.id === collectionId 
          ? { 
              ...collection, 
              totalVideos: collection.totalVideos + newVideos.length 
            }
          : collection
      ));

      console.log('usePlaylistManager: addVideos 完成');
      return newVideos.map(v => v.id);
    } catch (error) {
      console.error('usePlaylistManager: addVideos 发生错误:', error);
      throw error; // 重新抛出错误以便上层处理
    }
  };

  const markVideoAsPlayed = (videoId: string) => {
    setVideos(prev => prev.map(video => {
      if (video.id === videoId) {
        const now = new Date();
        if (!video.firstPlayDate) {
          // 第一次播放，自然日：次日0点
          const nextReviewDate = new Date(now);
          nextReviewDate.setDate(nextReviewDate.getDate() + REVIEW_INTERVALS[0]);
          nextReviewDate.setHours(0, 0, 0, 0); // 设为次日0点
          return {
            ...video,
            firstPlayDate: now,
            reviewCount: 1,
            nextReviewDate,
            status: 'learning' as const,
          };
        } else {
          // 复习
          const newReviewCount = video.reviewCount + 1;
          let nextReviewDate: Date | undefined;
          let status: VideoFile['status'] = 'learning';

          if (newReviewCount < 5) {
            nextReviewDate = new Date(now);
            nextReviewDate.setDate(nextReviewDate.getDate() + REVIEW_INTERVALS[newReviewCount - 1]);
          } else {
            status = 'completed';
            // 更新合辑完成数
            setCollections(prev => prev.map(collection => 
              collection.id === video.collectionId 
                ? { ...collection, completedVideos: collection.completedVideos + 1 }
                : collection
            ));
          }

          return {
            ...video,
            reviewCount: newReviewCount,
            nextReviewDate,
            status,
          };
        }
      }
      return video;
    }));
  };

  // 计算距离第一次观看的天数
  const getDaysSinceFirstPlay = (firstPlayDate: Date): number => {
    const today = new Date();
    const diffTime = today.getTime() - firstPlayDate.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  // 获取今日新学列表
  const getTodayNewVideos = (isExtraSession: boolean = false): PlaylistItem[] => {
    const activeCollectionIds = collections.filter(c => c.isActive).map(c => c.id);
    const activeVideos = videos.filter(v => activeCollectionIds.includes(v.collectionId));
    
    let newVideos: VideoFile[] = [];
    if (isExtraSession) {
      newVideos = activeVideos.filter(v => v.status === 'new').slice(0, MAX_NEW_PER_DAY + 2);
    } else {
      newVideos = activeVideos.filter(v => v.status === 'new').slice(0, MAX_NEW_PER_DAY);
    }

    return newVideos.map(video => ({
      videoId: video.id,
      reviewType: 'new',
      reviewNumber: 1,
    }));
  };

  // 获取今日复习列表（所有应复习的视频，音频/视频方式均可）
  const getTodayReviews = (): PlaylistItem[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeCollectionIds = collections.filter(c => c.isActive).map(c => c.id);
    const activeVideos = videos.filter(v => activeCollectionIds.includes(v.collectionId));

    const reviewVideos = activeVideos.filter(video => {
      if (!video.nextReviewDate || video.status === 'completed') return false;
      const reviewDate = new Date(video.nextReviewDate);
      reviewDate.setHours(0, 0, 0, 0);
      return reviewDate.getTime() <= today.getTime();
    });

    // 按复习次数排序，优先处理逾期时间长的
    reviewVideos.sort((a, b) => {
      if (!a.nextReviewDate || !b.nextReviewDate) return 0;
      return a.nextReviewDate.getTime() - b.nextReviewDate.getTime();
    });

    return reviewVideos.map(video => ({
      videoId: video.id,
      reviewType: 'review',
      reviewNumber: video.reviewCount + 1,
      daysSinceFirstPlay: video.firstPlayDate ? getDaysSinceFirstPlay(video.firstPlayDate) : 0,
      isRecommendedForVideo: [3,4,5].includes(video.reviewCount), // 15/30/90天建议视频复习
    }));
  };

  const generateTodayPlaylist = (isExtraSession: boolean = false): PlaylistPreview => {
    const newVideos = getTodayNewVideos(isExtraSession);
    const reviews = getTodayReviews();
    return {
      newVideos,
      reviews,
      totalCount: newVideos.length + reviews.length,
      isExtraSession,
    };
  };

  const createTodayPlaylist = (playlistType: 'new' | 'review', isExtraSession: boolean = false): DailyPlaylist => {
    let items: PlaylistItem[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // 检查当天是否已有未完成的新学习任务，避免重复生成
    if (playlistType === 'new') {
      const exist = playlists.find(p => {
        if (p.playlistType !== 'new' || p.isCompleted) return false;
        const pDate = new Date(p.date);
        pDate.setHours(0, 0, 0, 0);
        return pDate.getTime() === today.getTime();
      });
      if (exist) return exist;
      items = getTodayNewVideos(isExtraSession);
    } else if (playlistType === 'review') {
      items = getTodayReviews();
    }
    const playlist: DailyPlaylist = {
      id: generateUUID(),
      date: new Date(),
      items,
      isCompleted: false,
      lastPlayedIndex: 0,
      isExtraSession,
      playlistType,
    };
    setPlaylists(prev => [playlist, ...prev]);
    return playlist;
  };

  const getLastPlaylist = (): DailyPlaylist | null => {
    // 只返回当天的未完成新学习任务
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return playlists.find(p => {
      if (p.isCompleted || p.playlistType !== 'new') return false;
      const pDate = new Date(p.date);
      pDate.setHours(0, 0, 0, 0);
      return pDate.getTime() === today.getTime();
    }) || null;
  };

  const updatePlaylistProgress = (playlistId: string, lastPlayedIndex: number, isCompleted: boolean = false) => {
    setPlaylists(prev => prev.map(playlist => {
      if (playlist.id === playlistId) {
        return {
          ...playlist,
          lastPlayedIndex,
          isCompleted,
        };
      }
      return playlist;
    }));

    if (isCompleted) {
      // 标记所有播放的视频为已完成
      const playlist = playlists.find(p => p.id === playlistId);
      if (playlist) {
        playlist.items.forEach(item => {
          markVideoAsPlayed(item.videoId);
        });
      }
    }
  };

  const getStats = (): LearningStats => {
    const activeCollectionIds = collections.filter(c => c.isActive).map(c => c.id);
    const activeVideos = videos.filter(v => activeCollectionIds.includes(v.collectionId));
    const totalVideos = activeVideos.length;
    const completedVideos = activeVideos.filter(v => v.status === 'completed').length;
    const newVideos = getTodayNewVideos();
    const reviews = getTodayReviews();
    const overallProgress = totalVideos > 0 
      ? Math.round((completedVideos / totalVideos) * 100) 
      : 0;
    // 检查是否可以加餐（今日任务已完成）
    const canAddExtra = newVideos.length === 0 && activeVideos.some(v => v.status === 'new');
    return {
      totalVideos,
      completedVideos,
      todayNewCount: newVideos.length,
      todayReviewCount: reviews.length,
      overallProgress,
      activeCollections: collections.filter(c => c.isActive).length,
      canAddExtra,
    };
  };

  const deleteVideo = async (videoId: string) => {
    const video = videos.find(v => v.id === videoId);
    if (video) {
      try {
        // 清理文件URL
        if (video.fileUrl) {
          URL.revokeObjectURL(video.fileUrl);
        }
        
        // 从 IndexedDB 删除文件
        await fileStorage.deleteFile(videoId);
        
        // 更新合辑统计
        setCollections(prevCollections => prevCollections.map(collection => 
          collection.id === video.collectionId 
            ? { 
                ...collection, 
                totalVideos: Math.max(0, collection.totalVideos - 1),
                completedVideos: video.status === 'completed' 
                  ? Math.max(0, collection.completedVideos - 1)
                  : collection.completedVideos
              }
            : collection
        ));
      } catch (error) {
        console.error('Error deleting video file:', error);
      }
    }
    
    setVideos(prev => prev.filter(v => v.id !== videoId));
  };

  // 移除视频（对外接口）：删除文件并从播放列表中移除关联项
  const removeVideoById = async (videoId: string) => {
    try {
      await deleteVideo(videoId);
    } catch (error) {
      console.error('usePlaylistManager: removeVideoById 删除文件失败:', videoId, error);
    }

    // 从所有 playlist 中移除该视频引用
    setPlaylists(prev => prev.map(p => ({
      ...p,
      items: p.items.filter(item => item.videoId !== videoId),
    })));
  };

  const getVideoById = (id: string): VideoFile | undefined => {
    return videos.find(v => v.id === id);
  };

  // 清理对象URLs
  useEffect(() => {
    return () => {
      videos.forEach(video => {
        if (video.fileUrl) {
          URL.revokeObjectURL(video.fileUrl);
        }
      });
    };
  }, []);

  return {
    videos,
    playlists,
    collections,
    isLoading,
    addVideos,
    createCollection,
    updateCollection,
    deleteCollection,
    toggleCollection,
    generateTodayPlaylist,
    createTodayPlaylist,
    getLastPlaylist,
    updatePlaylistProgress,
    getStats,
    deleteVideo,
    getVideoById,
    getTodayNewVideos,
    getTodayReviews,
    removeVideoById,
  };
};