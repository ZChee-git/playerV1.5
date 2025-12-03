import React, { useRef, useState } from 'react';
import { Upload, Video, Plus, FolderOpen, AlertCircle, Loader, CheckCircle } from 'lucide-react';
import { Collection } from '../types';
import { validateVideoFiles } from '../utils/fileValidation';

interface VideoUploadProps {
  collections: Collection[];
  onVideoAdd: (files: File[], collectionId: string) => Promise<void>;
  onCreateCollection: (name: string, description?: string) => string;
}

export const VideoUpload: React.FC<VideoUploadProps> = ({ 
  collections, 
  onVideoAdd, 
  onCreateCollection 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [showCreateCollection, setShowCreateCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDesc, setNewCollectionDesc] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);

  const activeCollections = collections.filter(c => c.isActive);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0 && selectedCollection) {
      await processFiles(Array.from(files));
      // 重置输入
      if (event.target) {
        event.target.value = '';
      }
    } else if (!selectedCollection) {
      const win: any = window;
      if (win && typeof win.showToast === 'function') {
        win.showToast('请先选择一个合辑');
      } else {
        alert('请先选择一个合辑');
      }
    }
  };

  const handleFolderSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0 && selectedCollection) {
      await processFiles(Array.from(files));
      // 重置输入
      if (event.target) {
        event.target.value = '';
      }
    } else if (!selectedCollection) {
      const win: any = window;
      if (win && typeof win.showToast === 'function') {
        win.showToast('请先选择一个合辑');
      } else {
        alert('请先选择一个合辑');
      }
    }
  };

  const processFiles = async (files: File[]) => {
    setIsUploading(true);
    setUploadSuccess(false);
    setCurrentFileIndex(0);
    setTotalFiles(0);
    
    try {
      setUploadProgress('正在检查文件...');
      
      // 使用文件验证工具
      const validation = validateVideoFiles(files);
      
      if (validation.validFiles.length === 0) {
        setUploadProgress('');
        setIsUploading(false);
        
        if (validation.invalidFiles.length > 0) {
          const errorSummary = validation.invalidFiles
            .slice(0, 5) // 只显示前5个错误
            .map(item => `${item.file.name}: ${item.error}`)
            .join('\n');
          
          const win: any = window;
          const msg = `没有找到有效的视频文件：\n\n${errorSummary}${
            validation.invalidFiles.length > 5 ? `\n... 还有 ${validation.invalidFiles.length - 5} 个文件有问题` : ''
          }`;
          if (win && typeof win.showToast === 'function') {
            win.showToast(msg);
          } else {
            alert(msg);
          }
        } else {
          const win: any = window;
          if (win && typeof win.showToast === 'function') {
            win.showToast('没有找到支持的视频文件');
          } else {
            alert('没有找到支持的视频文件');
          }
        }
        return;
      }
      
      // 如果有无效文件，显示警告
      if (validation.invalidFiles.length > 0) {
        const skippedCount = validation.invalidFiles.length;
        setUploadProgress(`发现 ${validation.validFiles.length} 个有效视频文件，跳过 ${skippedCount} 个无效文件`);
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      
      setTotalFiles(validation.validFiles.length);
      setUploadProgress(`准备添加 ${validation.validFiles.length} 个视频文件...`);
      
      // 直接调用 onVideoAdd，不再分批处理
      console.log('开始添加文件到合辑:', selectedCollection);
      await onVideoAdd(validation.validFiles, selectedCollection);
      
      setUploadProgress('添加完成！');
      setUploadSuccess(true);
      
      // 成功后清理状态
      setTimeout(() => {
        setUploadProgress('');
        setIsUploading(false);
        setUploadSuccess(false);
        setCurrentFileIndex(0);
        setTotalFiles(0);
      }, 2000);
      
    } catch (error) {
      console.error('File upload error:', error);
      setUploadProgress('');
      setIsUploading(false);
      setUploadSuccess(false);
      setCurrentFileIndex(0);
      setTotalFiles(0);
      
      // 更详细的错误信息
      let errorMessage = '文件添加失败';
      if (error instanceof Error) {
        if (error.message.includes('storage') || error.message.includes('quota')) {
          errorMessage = '存储空间不足，请清理设备存储后重试';
        } else if (error.message.includes('network')) {
          errorMessage = '网络连接问题，请检查网络后重试';
        } else if (error.message.includes('MIME') || error.message.includes('Buffer')) {
          errorMessage = '文件格式识别失败，请确保文件完整且格式正确';
        } else {
          errorMessage = `文件处理失败：${error.message}`;
        }
      }
      
      const win: any = window;
      if (win && typeof win.showToast === 'function') {
        win.showToast(errorMessage);
      } else {
        alert(errorMessage);
      }
    }
  };

  const handleCreateCollection = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCollectionName.trim()) {
      const newId = onCreateCollection(newCollectionName.trim(), newCollectionDesc.trim());
      setSelectedCollection(newId);
      setNewCollectionName('');
      setNewCollectionDesc('');
      setShowCreateCollection(false);
    }
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    if (!selectedCollection) {
      const win: any = window;
      if (win && typeof win.showToast === 'function') {
        win.showToast('请先选择一个合辑');
      } else {
        alert('请先选择一个合辑');
      }
      return;
    }

    const files = Array.from(event.dataTransfer.files);
    await processFiles(files);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
        <Video className="mr-3 text-blue-600" size={28} />
        添加学习视频
      </h2>

      {/* 合辑选择 */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          选择目标合辑 *
        </label>
        <div className="flex flex-col space-y-2 md:space-y-0">
          <div className="flex-1 flex items-center space-x-3">
            <select
              value={selectedCollection}
              onChange={(e) => setSelectedCollection(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isUploading}
            >
              <option value="">请选择合辑...</option>
              {activeCollections.map(collection => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-between items-center w-full mt-2">
            <span className="text-sm text-gray-600 font-medium whitespace-nowrap">
              {activeCollections.length} 个活跃合辑
            </span>
          </div>
        </div>
      </div>

      {/* 创建合辑表单 */}
      {showCreateCollection && (
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold mb-3">创建新合辑</h3>
          <form onSubmit={handleCreateCollection} className="space-y-3">
            <input
              type="text"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              placeholder="合辑名称（如：小猪佩奇第1季）"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
            />
            <textarea
              value={newCollectionDesc}
              onChange={(e) => setNewCollectionDesc(e.target.value)}
              placeholder="描述（可选）"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              rows={2}
            />
            <div className="flex space-x-2">
              <button
                type="submit"
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium"
              >
                创建
              </button>
              <button
                type="button"
                onClick={() => setShowCreateCollection(false)}
                className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-lg font-medium"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 上传进度 */}
      {(isUploading || uploadSuccess) && (
        <div className={`border rounded-lg p-4 mb-6 ${
          uploadSuccess 
            ? 'bg-green-50 border-green-200' 
            : 'bg-blue-50 border-blue-200'
        }`}>
          <div className="flex items-center">
            {uploadSuccess ? (
              <CheckCircle className="text-green-600 mr-3" size={20} />
            ) : (
              <Loader className="animate-spin text-blue-600 mr-3" size={20} />
            )}
            <span className={`font-medium ${
              uploadSuccess ? 'text-green-800' : 'text-blue-800'
            }`}>
              {uploadProgress}
            </span>
          </div>
          {uploadSuccess && (
            <p className="text-green-700 text-sm mt-2">
              视频已成功添加到合辑中，可以开始学习了！
            </p>
          )}
          {isUploading && totalFiles > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-sm text-blue-700 mb-1">
                <span>处理进度</span>
                <span>{Math.min(currentFileIndex + 1, totalFiles)}/{totalFiles}</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${totalFiles > 0 ? (Math.min(currentFileIndex + 1, totalFiles) / totalFiles) * 100 : 0}%` }}
                />
              </div>
              <p className="text-blue-700 text-xs mt-1">
                请耐心等待，正在处理文件...
              </p>
            </div>
          )}
        </div>
      )}

      {/* 上传区域 */}
      {selectedCollection ? (
        <div
          className={`border-2 border-dashed rounded-lg p-8 md:p-12 text-center transition-colors cursor-pointer ${
            isUploading 
              ? 'border-gray-300 bg-gray-50 cursor-not-allowed' 
              : 'border-blue-300 bg-blue-50 hover:border-blue-500 hover:bg-blue-100'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          <Upload size={48} className={`mx-auto mb-4 ${isUploading ? 'text-gray-400' : 'text-blue-500'}`} />
          <p className={`text-lg md:text-xl mb-2 ${isUploading ? 'text-gray-500' : 'text-gray-600'}`}>
            {isUploading ? '正在处理文件...' : '拖拽媒体文件到这里或点击浏览'}
          </p>
          <p className="text-sm text-gray-500 mb-4">
            支持 视频: MP4, AVI, MOV, MKV 等 | 音频: MP3, WAV, M4A, AAC, OGG, FLAC
          </p>
          <p className="text-sm text-blue-600 font-medium">
            将添加到：{activeCollections.find(c => c.id === selectedCollection)?.name}
          </p>
          
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,audio/*,.mp4,.avi,.mov,.wmv,.mkv,.webm,.flv,.m4v,.3gp,.ogv,.ts,.mts,.mp3,.wav,.m4a,.aac,.ogg,.oga,.flac"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            disabled={isUploading}
          />
          
          <input
            ref={folderInputRef}
            type="file"
            accept="video/*,audio/*,.mp4,.avi,.mov,.wmv,.mkv,.webm,.flv,.m4v,.3gp,.ogv,.ts,.mts,.mp3,.wav,.m4a,.aac,.ogg,.oga,.flac"
            multiple
            {...({ webkitdirectory: "" } as any)}
            onChange={handleFolderSelect}
            className="hidden"
            disabled={isUploading}
          />
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 md:p-12 text-center bg-gray-50">
          <AlertCircle size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-xl text-gray-500 mb-2">
            请先选择一个合辑
          </p>
          <p className="text-sm text-gray-400">
            选择合辑后即可上传音视频文件
          </p>
        </div>
      )}

      {/* 操作按钮 */}
      {selectedCollection && !isUploading && (
        <div className="mt-6 flex flex-col md:flex-row justify-center space-y-3 md:space-y-0 md:space-x-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center justify-center transition-colors shadow-md hover:shadow-lg"
          >
            <Plus size={20} className="mr-2" />
            选择音视频
          </button>
          
          <button
            onClick={() => folderInputRef.current?.click()}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center justify-center transition-colors shadow-md hover:shadow-lg"
          >
            <FolderOpen size={20} className="mr-2" />
            选择文件夹
          </button>
        </div>
      )}

      {/* 移动端使用提示已删除 */}
    </div>
  );
};