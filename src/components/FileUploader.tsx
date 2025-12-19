import { useState, useEffect } from "react";

interface FileData {
  name?: string;
  dateUploaded?: string;
  link?: string;
  key?: string;
  uploaded?: string;
  httpMetadata?: {
    contentType?: string;
  };
}

interface FolderData {
  folders: string[];
  objects: FileData[];
  currentFolder: string;
}

export default function FileUploader() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [files, setFiles] = useState<FileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadMode, setUploadMode] = useState<"simple" | "multipart">(
    "simple"
  );
  const [customKey, setCustomKey] = useState("");
  const [replacingKey, setReplacingKey] = useState<string | null>(null);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [currentFolder, setCurrentFolder] = useState("");
  const [folders, setFolders] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [folderPath, setFolderPath] = useState("");
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // File type icons mapping
  const fileIcons: Record<string, string> = {
    pdf: "📄",
    doc: "📝",
    docx: "📝",
    txt: "📄",
    zip: "📦",
    rar: "📦",
    video: "🎥",
    audio: "🎵",
    default: "📎",
  };

  // Get file icon based on type
  const getFileIcon = (filename: string): string => {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext && fileIcons[ext]) {
      return fileIcons[ext];
    }

    if (filename.match(/\.(mp4|avi|mov|wmv|flv|webm|mkv)$/i)) {
      return fileIcons.video;
    }
    if (filename.match(/\.(mp3|wav|flac|aac|ogg|wma)$/i)) {
      return fileIcons.audio;
    }

    return fileIcons.default;
  };

  // Format date
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Generate random filename
  const generateRandomFilename = (originalName: string): string => {
    const ext = originalName.split(".").pop() || "";
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return ext ? `${timestamp}-${random}.${ext}` : `${timestamp}-${random}`;
  };

  // Check if file is an image
  const isImage = (filename: string): boolean => {
    return filename.match(/\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i) !== null;
  };

  // Helper function to get normalized base path
  const getBasePath = () => {
    const rawBasePath = import.meta.env.BASE_URL || '';
    return rawBasePath === '/' ? '' : rawBasePath.replace(/\/$/, '');
  };

  // Load uploaded files and folders
  const loadFiles = async (folderPath: string = "") => {
    try {
      setLoading(true);
      const folderParam = folderPath ? `?folder=${encodeURIComponent(folderPath)}&showFolders=true` : "?showFolders=true";
      const basePath = getBasePath();
      const apiPath = basePath ? `${basePath}/api/list-assets${folderParam}` : `/api/list-assets${folderParam}`;
      const response = await fetch(apiPath);

      if (!response.ok) {
        throw new Error("Failed to load files");
      }

      const data = (await response.json()) as FolderData;

      // Remove duplicates based on file key/name
      const uniqueFiles = data.objects.filter((file, index, self) => {
        const fileKey = file.key || file.name;
        return (
          fileKey &&
          index === self.findIndex((f) => (f.key || f.name) === fileKey)
        );
      });

      setFiles(uniqueFiles);
      setFolders(data.folders || []);
      setCurrentFolder(data.currentFolder || "");
    } catch (error) {
      console.error("Error loading files:", error);
      setFiles([]);
      setFolders([]);
    } finally {
      setLoading(false);
    }
  };

  // Load files on component mount or folder change
  useEffect(() => {
    loadFiles(currentFolder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolder]);

  // Simple upload function
  const uploadFileSimple = async () => {
    const file = selectedFile || (document.getElementById("fileUpload") as HTMLInputElement)?.files?.[0];

    if (!file) {
      alert("Please select a file first");
      return;
    }

    // If file is larger than 1MB, automatically use multipart upload to avoid 413 errors
    // This prevents hitting reverse proxy (nginx/openresty) size limits
    // Using a very conservative threshold since 413 errors suggest strict limits
    const FILE_SIZE_THRESHOLD = 1 * 1024 * 1024; // 1MB - very conservative threshold
    if (file.size > FILE_SIZE_THRESHOLD) {
      console.log(`File (${(file.size / 1024 / 1024).toFixed(2)}MB) larger than threshold, using multipart upload`);
      setIsUploading(false);
      setProgress(0);
      return uploadFileMultipart();
    }

    // Determine the final key that will be used
    // Get file extension
    const fileExtension = file.name.split(".").pop() || "";
    const customKeyTrimmed = customKey.trim();
    const targetFolder = folderPath.trim() || currentFolder;

    let finalKey: string;
    if (replacingKey) {
      finalKey = replacingKey;
    } else if (customKeyTrimmed) {
      // Check if custom key already has an extension
      const customKeyExt = customKeyTrimmed.split(".").pop() || "";
      const hasExtension = customKeyTrimmed.includes(".") &&
        customKeyExt.length > 0 &&
        customKeyExt.length < customKeyTrimmed.length;

      // If no extension, add the file's extension
      let keyWithExt = customKeyTrimmed;
      if (!hasExtension && fileExtension) {
        keyWithExt = `${customKeyTrimmed}.${fileExtension}`;
      }

      // If folder path is provided, prefix it
      finalKey = targetFolder
        ? `${targetFolder}/${keyWithExt}`
        : keyWithExt;
    } else {
      // Use file name directly - if folder path provided, prefix it
      finalKey = targetFolder
        ? `${targetFolder}/${file.name}`
        : file.name;
    }

    // Check if file exists (only if we have a specific key and not replacing)
    if (finalKey && !replacingKey) {
      try {
        const basePath = getBasePath();
        const apiPath = basePath ? `${basePath}/api/check-asset?key=${encodeURIComponent(finalKey)}` : `/api/check-asset?key=${encodeURIComponent(finalKey)}`;
        const checkResponse = await fetch(apiPath);
        if (checkResponse.ok) {
          const checkData = (await checkResponse.json()) as { exists: boolean };
          if (checkData.exists) {
            const fileName = finalKey.split("/").pop() || finalKey;
            const shouldReplace = confirm(
              `A file named "${fileName}" already exists. Do you want to replace it?`
            );
            if (!shouldReplace) {
              return; // User cancelled, don't upload
            }
          }
        }
      } catch (error) {
        console.error("Error checking file existence:", error);
        // Continue with upload even if check fails
      }
    }

    setIsUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Add custom key if provided, with proper extension handling
      let keyToUse: string = "";
      if (replacingKey) {
        keyToUse = replacingKey;
      } else if (customKey.trim()) {
        const customKeyTrimmed = customKey.trim();
        // Check if custom key already has an extension
        const customKeyExt = customKeyTrimmed.split(".").pop() || "";
        const fileExtension = file.name.split(".").pop() || "";
        const hasExtension = customKeyTrimmed.includes(".") &&
          customKeyExt.length > 0 &&
          customKeyExt.length < customKeyTrimmed.length;

        // If no extension, add the file's extension
        if (!hasExtension && fileExtension) {
          keyToUse = `${customKeyTrimmed}.${fileExtension}`;
        } else {
          keyToUse = customKeyTrimmed;
        }
        
        // Prepend folder path if provided
        const targetFolder = folderPath.trim() || currentFolder;
        if (targetFolder) {
          keyToUse = `${targetFolder}/${keyToUse}`;
        }
      } else {
        // No custom key - use file name (folder path will prefix it)
        const fileName = file.name;
        const targetFolder = folderPath.trim() || currentFolder;
        keyToUse = targetFolder
          ? `${targetFolder}/${fileName}`
          : fileName;
      }

      if (keyToUse) {
        formData.append("key", keyToUse);
      }

      // Add folder path (use folderPath if provided, otherwise currentFolder)
      const targetFolder = folderPath.trim() || currentFolder;
      if (targetFolder) {
        formData.append("folder", targetFolder);
      }

      const basePath = getBasePath();
      const apiPath = basePath ? `${basePath}/api/upload` : '/api/upload';
      const response = await fetch(apiPath, {
        method: "POST",
        credentials: 'include',
        body: formData,
      });

      // If we get a 413 error (file too large), automatically fallback to multipart upload
      if (response.status === 413) {
        console.log("File too large for simple upload, switching to multipart upload");
        setIsUploading(false);
        setProgress(0);
        return uploadFileMultipart();
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Upload failed:", response.status, errorText);
        throw new Error("Upload failed");
      }

      setProgress(100);
      alert("File uploaded successfully!");
      // Reset custom key, replacing key, folder path, and selected file after successful upload
      setCustomKey("");
      setReplacingKey(null);
      setFolderPath("");
      setSelectedFile(null);
      const fileInput = document.getElementById("fileUpload") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      loadFiles(currentFolder);
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
      setProgress(0);
    }
  };

  // Multipart upload function
  const uploadFileMultipart = async () => {
    const file = selectedFile || (document.getElementById("fileUpload") as HTMLInputElement)?.files?.[0];

    if (!file) {
      alert("Please select a file first");
      return;
    }

    // Determine the final key that will be used
    // Get file extension
    const fileExtension = file.name.split(".").pop() || "";
    const customKeyTrimmed = customKey.trim();
    const targetFolder = folderPath.trim() || currentFolder;

    let finalKey: string;
    if (replacingKey) {
      finalKey = replacingKey;
    } else if (customKeyTrimmed) {
      // Check if custom key already has an extension
      const customKeyExt = customKeyTrimmed.split(".").pop() || "";
      const hasExtension = customKeyTrimmed.includes(".") &&
        customKeyExt.length > 0 &&
        customKeyExt.length < customKeyTrimmed.length;

      // If no extension, add the file's extension
      let keyWithExt = customKeyTrimmed;
      if (!hasExtension && fileExtension) {
        keyWithExt = `${customKeyTrimmed}.${fileExtension}`;
      }

      // If folder path is provided, prefix it
      finalKey = targetFolder
        ? `${targetFolder}/${keyWithExt}`
        : keyWithExt;
    } else {
      // Use file name directly - if folder path provided, prefix it
      finalKey = targetFolder
        ? `${targetFolder}/${file.name}`
        : file.name;
    }

    // Check if file exists (only if we have a specific key and not replacing)
    if (finalKey && !replacingKey) {
      try {
        const basePath = getBasePath();
        const apiPath = basePath ? `${basePath}/api/check-asset?key=${encodeURIComponent(finalKey)}` : `/api/check-asset?key=${encodeURIComponent(finalKey)}`;
        const checkResponse = await fetch(apiPath);
        if (checkResponse.ok) {
          const checkData = (await checkResponse.json()) as { exists: boolean };
          if (checkData.exists) {
            const fileName = finalKey.split("/").pop() || finalKey;
            const shouldReplace = confirm(
              `A file named "${fileName}" already exists. Do you want to replace it?`
            );
            if (!shouldReplace) {
              return; // User cancelled, don't upload
            }
          }
        }
      } catch (error) {
        console.error("Error checking file existence:", error);
        // Continue with upload even if check fails
      }
    }

    setIsUploading(true);
    setProgress(0);

    try {
      // Use base path for API calls, not ASSETS_PREFIX (which might be a different domain)
      const basePath = getBasePath();
      const BASE_CF_URL = basePath ? `${basePath}/api/multipart-upload` : '/api/multipart-upload';
      // Use custom key if provided, otherwise use file name
      // Use folderPath if provided, otherwise use currentFolder
      const targetFolder = folderPath.trim() || currentFolder;
      let key: string;
      if (replacingKey) {
        key = replacingKey;
      } else if (customKey.trim()) {
        const customKeyTrimmed = customKey.trim();
        // Check if custom key already has an extension
        const customKeyExt = customKeyTrimmed.split(".").pop() || "";
        const fileExtension = file.name.split(".").pop() || "";
        const hasExtension = customKeyTrimmed.includes(".") &&
          customKeyExt.length > 0 &&
          customKeyExt.length < customKeyTrimmed.length;

        // If no extension, add the file's extension
        let keyWithExt = customKeyTrimmed;
        if (!hasExtension && fileExtension) {
          keyWithExt = `${customKeyTrimmed}.${fileExtension}`;
        }

        key = targetFolder && !keyWithExt.includes("/")
          ? `${targetFolder}/${keyWithExt}`
          : keyWithExt;
      } else {
        // If folderPath is provided but no custom key, use random filename
        const fileName = folderPath.trim() 
          ? generateRandomFilename(file.name)
          : file.name;
        key = targetFolder
          ? `${targetFolder}/${fileName}`
          : fileName;
      }
      // R2 multipart upload requires minimum 5MB per part (except last part)
      // Webflow Cloud limits: 500MB request body, 16KB URL, 30s timeout
      // Use 5MB chunks to meet R2 minimum, but ensure we stay under Webflow limits
      const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB - R2 minimum part size
      const totalParts = Math.ceil(file.size / CHUNK_SIZE);
      
      // If file is smaller than 5MB, we can't use multipart upload
      // Fall back to simple upload (which should work for small files)
      if (file.size < CHUNK_SIZE) {
        console.log("File smaller than 5MB, cannot use multipart upload. Using simple upload.");
        setIsUploading(false);
        setProgress(0);
        return uploadFileSimple();
      }

      // Step 1: Initiate upload
      // Construct full URL using current origin
      const createUploadUrl = BASE_CF_URL.startsWith('http')
        ? `${BASE_CF_URL}?action=create`
        : `${window.location.origin}${BASE_CF_URL}?action=create`;

      const createResponse = await fetch(createUploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ key, contentType: file.type }),
      });

      const createJson = (await createResponse.json()) as { uploadId: string };
      const uploadId = createJson.uploadId;

      // Step 2: Upload parts
      const partsData = [];
      const baseUploadUrl = BASE_CF_URL.startsWith('http')
        ? BASE_CF_URL
        : `${window.location.origin}${BASE_CF_URL}`;

      for (let i = 0; i < totalParts; i++) {
        const start = CHUNK_SIZE * i;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const blob = file.slice(start, end);
        const partNumber = i + 1;
        const isLastPart = i === totalParts - 1;

        // R2 requires minimum 5MB per part (except the last part)
        // Validate part size before uploading
        if (!isLastPart && blob.size < CHUNK_SIZE) {
          throw new Error(
            `Part ${partNumber} is ${(blob.size / 1024 / 1024).toFixed(2)}MB, but R2 requires minimum ${(CHUNK_SIZE / 1024 / 1024)}MB for non-final parts. This should not happen with proper chunking.`
          );
        }

        // Build URL with minimal query params to avoid 16KB URL limit
        // Keep only essential params in URL, encode properly
        const uploadPartUrl = new URL(baseUploadUrl);
        uploadPartUrl.searchParams.set("action", "upload-part");
        uploadPartUrl.searchParams.set("uploadId", uploadId);
        uploadPartUrl.searchParams.set("key", key);
        uploadPartUrl.searchParams.set("partNumber", partNumber.toString());

        // Check if URL is too long (approaching 16KB limit)
        if (uploadPartUrl.toString().length > 15000) {
          throw new Error(`URL too long (${uploadPartUrl.toString().length} bytes). Key may be too long.`);
        }

        let retries = 3;
        let uploadPartResponse: Response | null = null;
        
        while (retries > 0) {
          try {
            uploadPartResponse = await fetch(uploadPartUrl.toString(), {
              method: "PUT",
              credentials: 'include',
              body: blob,
              // Add timeout signal (25 seconds to be safe, under 30s limit)
              signal: AbortSignal.timeout(25000),
            });

            if (uploadPartResponse.ok) {
              break; // Success, exit retry loop
            }

            // Handle 413 error specifically - reverse proxy limit
            if (uploadPartResponse.status === 413) {
              throw new Error(
                `Upload failed: File part is too large for the server (413). ` +
                `The reverse proxy has a size limit that conflicts with R2's 5MB minimum part size requirement. ` +
                `Please contact support or try uploading a smaller file.`
              );
            }

            // If not OK and not a retryable error, throw
            if (uploadPartResponse.status !== 408 && uploadPartResponse.status !== 429 && uploadPartResponse.status < 500) {
              throw new Error(`Upload part failed: ${uploadPartResponse.status} ${uploadPartResponse.statusText}`);
            }

            // Retryable error - wait and retry
            retries--;
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries))); // Exponential backoff
            }
          } catch (error: unknown) {
            retries--;
            if (retries === 0) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              throw new Error(`Failed to upload part ${partNumber} after retries: ${errorMessage}`);
            }
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
          }
        }

        if (!uploadPartResponse || !uploadPartResponse.ok) {
          throw new Error(`Failed to upload part ${partNumber}`);
        }

        const uploadPartJson = (await uploadPartResponse.json()) as {
          etag: string;
        };
        const eTag = uploadPartJson.etag;

        partsData.push({ partNumber: partNumber, etag: eTag });

        // Update progress
        const currentProgress = ((i + 1) / totalParts) * 100;
        setProgress(currentProgress);
      }

      // Step 3: Complete upload
      const completeUploadUrl = BASE_CF_URL.startsWith('http')
        ? `${BASE_CF_URL}?action=complete`
        : `${window.location.origin}${BASE_CF_URL}?action=complete`;

      const completeResponse = await fetch(completeUploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({
          uploadId,
          key,
          parts: partsData.map((part) => ({
            partNumber: part.partNumber,
            etag: part.etag,
          })),
        }),
      });

      if (!completeResponse.ok) {
        throw new Error(`Complete upload failed: ${completeResponse.status}`);
      }

      const completeResult = (await completeResponse.json()) as {
        key: string;
        etag: string;
        size: number;
      };

      alert("File uploaded successfully!");
      // Reset custom key, replacing key, folder path, and selected file after successful upload
      setCustomKey("");
      setReplacingKey(null);
      setFolderPath("");
      setSelectedFile(null);
      const fileInput = document.getElementById("fileUpload") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      loadFiles(currentFolder);
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
      setProgress(0);
    }
  };

  const uploadFile =
    uploadMode === "simple" ? uploadFileSimple : uploadFileMultipart;

  // Copy URL to clipboard function
  const copyUrlToClipboard = async (fileKey: string) => {
    try {
      // Get current hostname and path
      const currentOrigin = window.location.origin;
      const basePath = getBasePath();
      const apiPath = basePath ? `${basePath}/api/asset` : '/api/asset';
      const fullUrl = `${currentOrigin}${apiPath}?key=${encodeURIComponent(fileKey)}`;

      await navigator.clipboard.writeText(fullUrl);

      // Show toast
      setToastMessage("URL copied to clipboard!");
      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
      }, 3000);
    } catch (error) {
      console.error("Failed to copy URL:", error);
      setToastMessage("Failed to copy URL");
      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
      }, 3000);
    }
  };

  // Delete file function
  const deleteFile = async (key: string, fileName: string) => {
    if (!confirm(`Are you sure you want to delete "${fileName}"?`)) {
      return;
    }

    try {
      const basePath = getBasePath();
      const apiPath = basePath ? `${basePath}/api/delete-asset?key=${encodeURIComponent(key)}` : `/api/delete-asset?key=${encodeURIComponent(key)}`;
      const response = await fetch(apiPath, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete file");
      }

      alert("File deleted successfully!");
      loadFiles(currentFolder);
    } catch (error) {
      console.error("Delete failed:", error);
      alert("Failed to delete file. Please try again.");
    }
  };

  // Rename file function
  const renameFile = async (oldKey: string, newKey: string) => {
    if (!newKey.trim()) {
      alert("Please enter a new file name");
      return;
    }

    if (oldKey === newKey.trim()) {
      alert("New name must be different from the current name");
      return;
    }

    try {
      const basePath = getBasePath();
      const apiPath = basePath ? `${basePath}/api/rename-asset` : '/api/rename-asset';
      const response = await fetch(apiPath, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          oldKey,
          newKey: newKey.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || "Failed to rename file");
      }

      alert("File renamed successfully!");
      setRenamingKey(null);
      setNewFileName("");
      loadFiles(currentFolder);
    } catch (error: unknown) {
      console.error("Rename failed:", error);
      alert(
        error instanceof Error ? error.message : "Failed to rename file. Please try again."
      );
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto", position: "relative" }}>
      {/* Logout Button - Top Right */}
      <button
        onClick={async () => {
          try {
            // Get base path for API call and redirect
            const rawBasePath = import.meta.env.BASE_URL || '';
            const basePath = rawBasePath === '/' ? '' : rawBasePath.replace(/\/$/, '');
            const logoutPath = basePath ? `${basePath}/api/auth/logout` : '/api/auth/logout';

            // Call logout endpoint to clear httpOnly cookie
            // Use credentials: 'include' to ensure cookies are sent
            const response = await fetch(logoutPath, {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
              },
            });

            // Wait for the response to ensure cookie is cleared
            if (response.ok) {
              // Cookie is now cleared, redirect to login
              const loginPath = basePath ? `${basePath}/login` : '/login';
              window.location.href = loginPath;
            } else {
              console.error('Logout failed:', response.status, response.statusText);
              // Even if logout fails, redirect to login (auth check will handle it)
              const loginPath = basePath ? `${basePath}/login` : '/login';
              window.location.href = loginPath;
            }
          } catch (error) {
            console.error('Logout error:', error);
            // Fallback: redirect to login (auth check will handle it)
            const rawBasePath = import.meta.env.BASE_URL || '';
            const basePath = rawBasePath === '/' ? '' : rawBasePath.replace(/\/$/, '');
            const loginPath = basePath ? `${basePath}/login` : '/login';
            window.location.href = loginPath;
          }
        }}
        style={{
          position: "fixed",
          top: "16px",
          right: "16px",
          zIndex: 10000,
          padding: "8px 16px",
          border: "1px solid #ef4444",
          background: "transparent",
          color: "#ef4444",
          borderRadius: "6px",
          fontSize: "14px",
          fontWeight: "500",
          cursor: "pointer",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#ef4444";
          e.currentTarget.style.color = "white";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "#ef4444";
        }}
      >
        Logout
      </button>

      <h2
        style={{
          fontSize: "1.8rem",
          fontWeight: "600",
          marginBottom: "1.5rem",
          textAlign: "center",
          color: "#333",
        }}
      >
        File Upload Demo
      </h2>

      {/* Upload Mode Toggle */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        <button
          onClick={() => setUploadMode("simple")}
          style={{
            padding: "12px 24px",
            borderRadius: "8px",
            border: "2px solid #146ef5",
            background: uploadMode === "simple" ? "#146ef5" : "transparent",
            color: uploadMode === "simple" ? "white" : "#146ef5",
            cursor: "pointer",
            fontSize: "1rem",
            fontWeight: "600",
            transition: "all 0.3s ease",
          }}
        >
          Simple Upload
        </button>
        <button
          onClick={() => setUploadMode("multipart")}
          style={{
            padding: "12px 24px",
            borderRadius: "8px",
            border: "2px solid #146ef5",
            background: uploadMode === "multipart" ? "#146ef5" : "transparent",
            color: uploadMode === "multipart" ? "white" : "#146ef5",
            cursor: "pointer",
            fontSize: "1rem",
            fontWeight: "600",
            transition: "all 0.3s ease",
          }}
        >
          Multipart Upload
        </button>
      </div>

      {/* Upload Section */}
      <div
        style={{
          marginBottom: "2rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
        }}
      >
        {/* 1. File Selection */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          <label
            style={{
              fontSize: "14px",
              fontWeight: "500",
              color: "#333",
            }}
          >
            Select File
          </label>
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <input
              type="file"
              id="fileUpload"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setSelectedFile(file);
                  // Reset replacing key when new file is selected
                  if (!replacingKey) {
                    setCustomKey("");
                  }
                } else {
                  setSelectedFile(null);
                }
              }}
              style={{
                flex: "1",
                padding: "12px 16px",
                border: selectedFile ? "2px solid #10b981" : "2px solid #e1e5e9",
                borderRadius: "8px",
                fontSize: "14px",
                backgroundColor: selectedFile ? "#f0fdf4" : "#fff",
                cursor: "pointer",
                transition: "all 0.3s ease",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#146ef5";
                e.target.style.boxShadow = "0 0 0 3px rgba(20, 110, 245, 0.1)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = selectedFile ? "#10b981" : "#e1e5e9";
                e.target.style.boxShadow = "none";
              }}
            />
            {selectedFile && (
              <div
                style={{
                  padding: "8px 12px",
                  backgroundColor: "#10b981",
                  color: "white",
                  borderRadius: "6px",
                  fontSize: "14px",
                  fontWeight: "500",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span>✓</span>
                <span>{selectedFile.name}</span>
              </div>
            )}
          </div>
        </div>

        {/* 2. File Name/URL/Key Input and Folder Path - Combined Section */}
        <div
          style={{
            padding: "1rem",
            backgroundColor: "#f8f9fa",
            borderRadius: "8px",
            border: "1px solid #e1e5e9",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          {/* File Name/URL/Key Input */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            <label
              style={{
                fontSize: "14px",
                fontWeight: "500",
                color: "#333",
              }}
            >
              File name or URL or key {replacingKey && <span style={{ color: "#146ef5" }}>- Replacing: {replacingKey}</span>}
              <span style={{ fontSize: "12px", color: "#666", fontWeight: "normal" }}> (if not entered, then the name of the file will be automatically picked up)</span>
            </label>
            <input
              type="text"
              value={customKey}
              onChange={(e) => setCustomKey(e.target.value)}
              placeholder={selectedFile ? `e.g., my-document.pdf (leave empty to use "${selectedFile.name}")` : "e.g., my-document.pdf (leave empty for auto-generated name)"}
              disabled={!!replacingKey}
              style={{
                padding: "12px 16px",
                border: "2px solid #e1e5e9",
                borderRadius: "6px",
                fontSize: "14px",
                backgroundColor: replacingKey ? "#f5f5f5" : "#fff",
                transition: "all 0.3s ease",
              }}
              onFocus={(e) => {
                if (!replacingKey) {
                  e.target.style.borderColor = "#146ef5";
                  e.target.style.boxShadow = "0 0 0 3px rgba(20, 110, 245, 0.1)";
                }
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#e1e5e9";
                e.target.style.boxShadow = "none";
              }}
            />
            {replacingKey && (
              <button
                onClick={() => {
                  setReplacingKey(null);
                  setCustomKey("");
                  setSelectedFile(null);
                  const fileInput = document.getElementById("fileUpload") as HTMLInputElement;
                  if (fileInput) fileInput.value = "";
                }}
                style={{
                  padding: "8px 16px",
                  border: "1px solid #e1e5e9",
                  background: "transparent",
                  color: "#666",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  alignSelf: "flex-start",
                }}
              >
                Cancel Replace
              </button>
            )}
          </div>

          {/* Folder Path Input */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            <label
              style={{
                fontSize: "14px",
                fontWeight: "500",
                color: "#333",
              }}
            >
              Folder Path (optional)
              <span
                style={{
                  fontSize: "12px",
                  color: "#666",
                  fontWeight: "normal",
                  display: "block",
                  marginTop: "4px",
                  fontStyle: "italic",
                }}
              >
                💡 <strong>Note:</strong> This solution works with Cloudflare R2, which does not natively support folders. 
                We simulate folders by prefixing the file name with the folder path (e.g., "documents/2024/file.pdf"). 
                In the UI, we create virtual partitions to organize files better. If you enter a folder path, it will be prefixed with the file name. You don't need to enter the file name in the folder path.
              </span>
            </label>
            <input
              type="text"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="e.g., documents/2024/january (leave empty for root folder)"
              style={{
                padding: "12px 16px",
                border: "2px solid #e1e5e9",
                borderRadius: "6px",
                fontSize: "14px",
                backgroundColor: "#fff",
                transition: "all 0.3s ease",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#146ef5";
                e.target.style.boxShadow = "0 0 0 3px rgba(20, 110, 245, 0.1)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#e1e5e9";
                e.target.style.boxShadow = "none";
              }}
            />
            {folderPath && selectedFile && (
              <p
                style={{
                  fontSize: "12px",
                  color: "#666",
                  margin: "0",
                  fontStyle: "italic",
                }}
              >
                File will be uploaded as: <strong>{folderPath}/{customKey || selectedFile.name}</strong>
              </p>
            )}
          </div>
        </div>

        <button
          onClick={uploadFile}
          disabled={isUploading}
          style={{
            padding: "14px 24px",
            backgroundColor: isUploading ? "#ccc" : "#146ef5",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: isUploading ? "not-allowed" : "pointer",
            fontSize: "16px",
            fontWeight: "600",
            transition: "all 0.3s ease",
            boxShadow: isUploading
              ? "none"
              : "0 2px 4px rgba(20, 110, 245, 0.2)",
            transform: isUploading ? "none" : "translateY(0)",
          }}
          onMouseEnter={(e) => {
            if (!isUploading) {
              e.currentTarget.style.backgroundColor = "#2c80fd";
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow =
                "0 4px 8px rgba(20, 110, 245, 0.3)";
            }
          }}
          onMouseLeave={(e) => {
            if (!isUploading) {
              e.currentTarget.style.backgroundColor = "#146ef5";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow =
                "0 2px 4px rgba(20, 110, 245, 0.2)";
            }
          }}
        >
          {isUploading ? (
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "16px",
                  height: "16px",
                  border: "2px solid transparent",
                  borderTop: "2px solid white",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }}
              ></div>
              Uploading...
            </span>
          ) : (
            `Upload File (${uploadMode === "simple" ? "Simple" : "Multipart"})`
          )}
        </button>

        {/* Upload Progress */}
        {isUploading && (
          <div style={{ marginTop: "20px" }}>
            <div
              style={{
                width: "100%",
                backgroundColor: "#f0f0f0",
                borderRadius: "8px",
                overflow: "hidden",
                height: "12px",
                boxShadow: "inset 0 1px 3px rgba(0, 0, 0, 0.1)",
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: "100%",
                  background:
                    "linear-gradient(90deg, #146ef5 0%, #2c80fd 100%)",
                  transition: "width 0.3s ease",
                  borderRadius: "8px",
                  boxShadow: "0 1px 3px rgba(20, 110, 245, 0.3)",
                }}
              />
            </div>
            <p
              style={{
                marginTop: "8px",
                fontSize: "14px",
                textAlign: "center",
                color: "#666",
                fontWeight: "500",
              }}
            >
              Upload Progress: {Math.round(progress)}%
            </p>
          </div>
        )}
      </div>

      {/* Files Gallery */}
      <div
        style={{
          border: "1px solid #e1e5e9",
          borderRadius: "12px",
          padding: "1.5rem",
          backgroundColor: "#fafbfc",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <h3
            style={{
              fontSize: "1.3rem",
              fontWeight: "600",
              color: "#333",
              margin: 0,
            }}
          >
            Uploaded Files
          </h3>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {/* Search Input */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              style={{
                padding: "8px 12px",
                border: "2px solid #e1e5e9",
                borderRadius: "6px",
                fontSize: "14px",
                minWidth: "200px",
              }}
            />
          <button
              onClick={() => loadFiles(currentFolder)}
            disabled={loading}
            style={{
              padding: "8px 16px",
              border: "1px solid #146ef5",
              background: "transparent",
              color: "#146ef5",
              borderRadius: "6px",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "14px",
              fontWeight: "500",
              transition: "all 0.3s ease",
            }}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
          </div>
        </div>

        {/* Breadcrumb Navigation */}
        {currentFolder && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "1rem",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => setCurrentFolder("")}
              style={{
                padding: "4px 8px",
                border: "none",
                background: "transparent",
                color: "#146ef5",
                cursor: "pointer",
                fontSize: "14px",
                textDecoration: "underline",
              }}
            >
              Root
            </button>
            {currentFolder.split("/").map((folder, index, arr) => {
              const path = arr.slice(0, index + 1).join("/");
              return (
                <span key={path} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ color: "#666" }}>/</span>
                  <button
                    onClick={() => setCurrentFolder(path)}
                    style={{
                      padding: "4px 8px",
                      border: "none",
                      background: "transparent",
                      color: "#146ef5",
                      cursor: "pointer",
                      fontSize: "14px",
                      textDecoration: index === arr.length - 1 ? "none" : "underline",
                    }}
                  >
                    {folder}
                  </button>
                </span>
              );
            })}
          </div>
        )}


        {loading ? (
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <div
              style={{
                width: "24px",
                height: "24px",
                border: "2px solid transparent",
                borderTop: "2px solid #146ef5",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "0 auto 1rem",
              }}
            ></div>
            <p style={{ color: "#666", margin: 0 }}>Loading files...</p>
          </div>
        ) : files.length === 0 && folders.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📁</div>
            <p style={{ color: "#666", margin: 0 }}>No files uploaded yet</p>
            <p
              style={{
                color: "#999",
                fontSize: "0.9rem",
                margin: "0.5rem 0 0 0",
              }}
            >
              Upload some files to get started
            </p>
          </div>
        ) : (
          <>
            {/* Bulk Operations Toolbar */}
            {selectedFiles.size > 0 && (
              <div
                style={{
                  marginBottom: "1rem",
                  padding: "1rem",
                  backgroundColor: "#e3f2fd",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontWeight: "600", color: "#1976d2" }}>
                  {selectedFiles.size} file{selectedFiles.size > 1 ? "s" : ""} selected
                </span>
                <button
                  onClick={async () => {
                    if (!confirm(`Delete ${selectedFiles.size} file(s)?`)) return;
                    try {
                      const deletePromises = Array.from(selectedFiles).map(async (key) => {
                        const basePath = getBasePath();
                        const apiPath = basePath ? `${basePath}/api/delete-asset?key=${encodeURIComponent(key)}` : `/api/delete-asset?key=${encodeURIComponent(key)}`;
                        const response = await fetch(apiPath, { method: "DELETE" });
                        return response.ok;
                      });
                      await Promise.all(deletePromises);
                      setSelectedFiles(new Set());
                      loadFiles(currentFolder);
                      setToastMessage("Files deleted successfully!");
                      setShowToast(true);
                      setTimeout(() => setShowToast(false), 3000);
                    } catch (error) {
                      alert("Failed to delete files");
                    }
                  }}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#ef4444",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "500",
                  }}
                >
                  Delete Selected
                </button>
                <button
                  onClick={() => {
                    const urls = Array.from(selectedFiles).map((key) => {
                      const baseUrl = window.location.origin;
                      const basePath = getBasePath();
                      const apiPath = basePath ? `${basePath}/api/asset` : '/api/asset';
                      return `${baseUrl}${apiPath}?key=${encodeURIComponent(key)}`;
                    });
                    const text = urls.join("\n");
                    navigator.clipboard.writeText(text).then(() => {
                      setToastMessage("URLs copied to clipboard!");
                      setShowToast(true);
                      setTimeout(() => setShowToast(false), 3000);
                    });
                  }}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#8b5cf6",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "500",
                  }}
                >
                  Copy URLs
                </button>
                <button
                  onClick={() => setSelectedFiles(new Set())}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#6b7280",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "500",
                  }}
                >
                  Clear Selection
                </button>
              </div>
            )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "1rem",
            }}
          >
                {/* Display Folders */}
                {folders
                  .filter((folder) => {
                    if (!searchQuery.trim()) return true;
                    const folderName = folder.split("/").pop() || folder;
                    return folderName.toLowerCase().includes(searchQuery.toLowerCase());
                  })
                  .map((folder) => {
                    // The folder from API is already the full path (e.g., "folder1/folder2")
                    // Remove trailing slash if present
                    const folderPath = folder.replace(/\/$/, "");
                    // Extract just the display name (last part of the path)
                    const folderName = folderPath.split("/").pop() || folderPath;
                    return (
                      <div
                        key={folder}
                        style={{
                          border: "1px solid #e1e5e9",
                          borderRadius: "8px",
                          overflow: "hidden",
                          backgroundColor: "white",
                          transition: "all 0.3s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = "translateY(-2px)";
                          e.currentTarget.style.boxShadow =
                            "0 4px 12px rgba(0, 0, 0, 0.1)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "translateY(0)";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      >
                        <div 
                          style={{ padding: "1rem", textAlign: "center", cursor: "pointer" }}
                          onClick={() => setCurrentFolder(folderPath)}
                        >
                          <div
                            style={{
                              fontSize: "3rem",
                              marginBottom: "0.5rem",
                            }}
                          >
                            📁
                          </div>
                          {renamingFolder === folderPath ? (
                            <input
                              type="text"
                              value={newFolderName}
                              onChange={(e) => setNewFolderName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && newFolderName.trim()) {
                                  // Rename logic - update folder path
                                  // Get parent path from the current folder path
                                  const parentPath = folderPath.split("/").slice(0, -1).join("/");
                                  const newFolderPath = parentPath
                                    ? `${parentPath}/${newFolderName.trim()}`
                                    : newFolderName.trim();
                                  setCurrentFolder(newFolderPath);
                                  setRenamingFolder(null);
                                  setNewFolderName("");
                                  loadFiles(newFolderPath);
                                } else if (e.key === "Escape") {
                                  setRenamingFolder(null);
                                  setNewFolderName("");
                                }
                              }}
                              style={{
                                padding: "4px 8px",
                                border: "1px solid #146ef5",
                                borderRadius: "4px",
                                fontSize: "0.9rem",
                                width: "100%",
                                marginBottom: "0.5rem",
                              }}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <h4
                              style={{
                                fontSize: "0.9rem",
                                fontWeight: "600",
                                margin: "0",
                                color: "#333",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {folderName}
                            </h4>
                          )}
                          <p
                            style={{
                              fontSize: "0.75rem",
                              color: "#666",
                              margin: "0.5rem 0 0 0",
                            }}
                          >
                            Folder
                          </p>
                        </div>
                        {/* Folder Actions */}
                        <div 
                          style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", justifyContent: "center", padding: "0 1rem 1rem" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {renamingFolder === folderPath ? (
                            <>
                              <button
                                onClick={() => {
                                  // Get parent path from the current folder path
                                  const parentPath = folderPath.split("/").slice(0, -1).join("/");
                                  const newFolderPath = parentPath
                                    ? `${parentPath}/${newFolderName.trim()}`
                                    : newFolderName.trim();
                                  setCurrentFolder(newFolderPath);
                                  setRenamingFolder(null);
                                  setNewFolderName("");
                                  loadFiles(newFolderPath);
                                }}
                                style={{
                                  padding: "4px 8px",
                                  backgroundColor: "#10b981",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "4px",
                                  fontSize: "0.75rem",
                                  cursor: "pointer",
                                }}
                              >
                                Save
                              </button>
                              <button
                                onClick={() => {
                                  setRenamingFolder(null);
                                  setNewFolderName("");
                                }}
                                style={{
                                  padding: "4px 8px",
                                  backgroundColor: "#666",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "4px",
                                  fontSize: "0.75rem",
                                  cursor: "pointer",
                                }}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                    setRenamingFolder(folderPath);
                                  setNewFolderName(folderName);
                                }}
                                style={{
                                  padding: "4px 8px",
                                  backgroundColor: "#10b981",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "4px",
                                  fontSize: "0.75rem",
                                  cursor: "pointer",
                                }}
                              >
                                Rename
                              </button>
                              <button
                                onClick={async () => {
                                  if (!confirm(`Delete folder "${folderName}" and all its contents?`)) return;
                                  // Delete all files in folder
                                  try {
                                    const folderFiles = files.filter((f) => {
                                      const fKey = f.key || "";
                                      return fKey.startsWith(folderPath + "/");
                                    });
                                    const deletePromises = folderFiles.map(async (f) => {
                                      const basePath = getBasePath();
                                      const apiPath = basePath ? `${basePath}/api/delete-asset?key=${encodeURIComponent(f.key || "")}` : `/api/delete-asset?key=${encodeURIComponent(f.key || "")}`;
                                      const response = await fetch(apiPath, { method: "DELETE" });
                                      return response.ok;
                                    });
                                    await Promise.all(deletePromises);
                                    loadFiles(currentFolder);
                                  } catch (error) {
                                    alert("Failed to delete folder");
                                  }
                                }}
                                style={{
                                  padding: "4px 8px",
                                  backgroundColor: "#ef4444",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "4px",
                                  fontSize: "0.75rem",
                                  cursor: "pointer",
                                }}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                {/* Display Files */}
                {files
                  .filter((file) => {
                    if (!searchQuery.trim()) return true;
                    const fileKey = file.key || file.name || "";
                    const fileName = fileKey.split("/").pop() || file.name || "";
                    return fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      fileKey.toLowerCase().includes(searchQuery.toLowerCase());
                  })
                  .map((file, index) => {
                    // Extract just the filename from the key (remove folder path)
              const fileKey = file.key || file.name || `file-${index}`;
                    const fileName = fileKey.split("/").pop() || file.name || "Unknown file";
              const fileLink =
                file.link ||
                (file.key
                  ? (() => {
                      const basePath = getBasePath();
                      const apiPath = basePath ? `${basePath}/api/asset` : '/api/asset';
                      return `${apiPath}?key=${encodeURIComponent(file.key)}`;
                    })()
                  : "");
              const uploadDate =
                file.dateUploaded || file.uploaded || new Date().toISOString();
              const isImageFile = isImage(fileName);
                    const isRenaming = renamingKey === fileKey;

              return (
                <div
                  key={fileKey}
                  style={{
                    border: "1px solid #e1e5e9",
                    borderRadius: "8px",
                    overflow: "hidden",
                    backgroundColor: "white",
                    transition: "all 0.3s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow =
                      "0 4px 12px rgba(0, 0, 0, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div style={{ padding: "1rem", position: "relative" }}>
                    {/* Bulk Select Checkbox */}
                    <input
                      type="checkbox"
                      checked={selectedFiles.has(fileKey)}
                      onChange={(e) => {
                        const newSelected = new Set(selectedFiles);
                        if (e.target.checked) {
                          newSelected.add(fileKey);
                        } else {
                          newSelected.delete(fileKey);
                        }
                        setSelectedFiles(newSelected);
                      }}
                      style={{
                        position: "absolute",
                        top: "8px",
                        right: "8px",
                        width: "20px",
                        height: "20px",
                        cursor: "pointer",
                        zIndex: 10,
                      }}
                    />
                    {isImageFile ? (
                      <img
                        src={fileLink}
                        alt={fileName}
                        style={{
                          width: "100%",
                          height: "120px",
                          objectFit: "cover",
                          borderRadius: "6px",
                          marginBottom: "0.5rem",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          height: "120px",
                          backgroundColor: "#f8f9fa",
                          borderRadius: "6px",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <span style={{ fontSize: "2rem" }}>
                          {getFileIcon(fileName)}
                        </span>
                      </div>
                    )}
                    {isRenaming ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.5rem",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <input
                          type="text"
                          value={newFileName}
                          onChange={(e) => setNewFileName(e.target.value)}
                          placeholder="Enter new file name"
                          autoFocus
                          style={{
                            padding: "6px 12px",
                            border: "2px solid #146ef5",
                            borderRadius: "4px",
                            fontSize: "0.9rem",
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              renameFile(fileKey, newFileName);
                            } else if (e.key === "Escape") {
                              setRenamingKey(null);
                              setNewFileName("");
                            }
                          }}
                        />
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button
                            onClick={() => renameFile(fileKey, newFileName)}
                            style={{
                              padding: "4px 8px",
                              backgroundColor: "#146ef5",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              fontSize: "0.75rem",
                              cursor: "pointer",
                            }}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setRenamingKey(null);
                              setNewFileName("");
                            }}
                            style={{
                              padding: "4px 8px",
                              backgroundColor: "#666",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              fontSize: "0.75rem",
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                    <h4
                      style={{
                        fontSize: "0.9rem",
                        fontWeight: "600",
                        margin: "0 0 0.25rem 0",
                        color: "#333",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fileName}
                    </h4>
                    <p
                      style={{
                        fontSize: "0.75rem",
                        color: "#666",
                        margin: "0 0 0.5rem 0",
                      }}
                    >
                      {formatDate(uploadDate)}
                    </p>
                      </>
                    )}
                    {!isRenaming && (
                      <div
                        style={{
                          display: "flex",
                          gap: "0.5rem",
                          flexWrap: "wrap",
                        }}
                      >
                    <a
                      href={fileLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-block",
                        padding: "6px 12px",
                        backgroundColor: "#146ef5",
                        color: "white",
                        textDecoration: "none",
                        borderRadius: "4px",
                        fontSize: "0.8rem",
                        fontWeight: "500",
                        transition: "background-color 0.3s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#2c80fd";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "#146ef5";
                      }}
                    >
                      View
                    </a>
                        <button
                          onClick={() => copyUrlToClipboard(fileKey)}
                          style={{
                            padding: "6px 12px",
                            backgroundColor: "#8b5cf6",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            fontSize: "0.8rem",
                            fontWeight: "500",
                            cursor: "pointer",
                            transition: "background-color 0.3s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#7c3aed";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "#8b5cf6";
                          }}
                        >
                          Copy URL
                        </button>
                        <button
                          onClick={() => {
                            setRenamingKey(fileKey);
                            setNewFileName(fileName);
                          }}
                          style={{
                            padding: "6px 12px",
                            backgroundColor: "#10b981",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            fontSize: "0.8rem",
                            fontWeight: "500",
                            cursor: "pointer",
                            transition: "background-color 0.3s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#059669";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "#10b981";
                          }}
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => {
                            const shouldReplace = confirm(
                              `Do you want to replace "${fileName}"?`
                            );
                            if (shouldReplace) {
                              setReplacingKey(fileKey);
                              setCustomKey(fileKey);
                              // Scroll to upload section
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }
                          }}
                          style={{
                            padding: "6px 12px",
                            backgroundColor: "#f59e0b",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            fontSize: "0.8rem",
                            fontWeight: "500",
                            cursor: "pointer",
                            transition: "background-color 0.3s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#d97706";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "#f59e0b";
                          }}
                        >
                          Replace
                        </button>
                        <button
                          onClick={() => deleteFile(fileKey, fileName)}
                          style={{
                            padding: "6px 12px",
                            backgroundColor: "#ef4444",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            fontSize: "0.8rem",
                            fontWeight: "500",
                            cursor: "pointer",
                            transition: "background-color 0.3s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#dc2626";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "#ef4444";
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}
      </div>

      {/* Toast Notification */}
      {showToast && (
        <div
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            backgroundColor: "#10b981",
            color: "white",
            padding: "12px 24px",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            animation: "slideIn 0.3s ease",
          }}
        >
          <span style={{ fontSize: "18px" }}>✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes slideIn {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `,
        }}
      />
    </div>
  );
}
