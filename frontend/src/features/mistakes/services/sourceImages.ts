import { backendRequest } from '@/shared/api/api';
import { cloud } from '@/shared/api/supabaseClient';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import type { PreparedImage } from '@/features/mistakes/lib/imageInput';

export async function sourceImageAccount(): Promise<string> {
  if (!cloud) throw new Error('Đăng nhập Google để lưu ảnh nguồn cùng thẻ.');
  const { data: { session } } = await cloud.auth.getSession();
  if (!session || session.user.is_anonymous || getActiveAccountId() !== session.user.id) {
    throw new Error('Đăng nhập Google và kết nối đồng bộ để lưu ảnh nguồn cùng thẻ.');
  }
  return session.user.id;
}

export async function uploadSourceImages(images: PreparedImage[]): Promise<string[]> {
  const owner = await sourceImageAccount();
  const value = await backendRequest<{ sourceImageIds: string[] }>('/api/v1/mistake-images', 'POST', {
    images: images.map(image => ({ dataUrl: image.dataUrl }))
  }, owner);
  if (getActiveAccountId() !== owner) throw new Error('Tài khoản đã thay đổi. Chưa lưu thẻ.');
  if (!Array.isArray(value.sourceImageIds) || !value.sourceImageIds.length || value.sourceImageIds.length > 3
    || value.sourceImageIds.some(id => !/^[a-f0-9]{64}$/.test(id))) throw new Error('Máy chủ trả liên kết ảnh chưa hợp lệ. Chưa lưu thẻ.');
  return value.sourceImageIds;
}

export async function sourceImageUrls(ids: string[]): Promise<Array<{ id: string; url: string }>> {
  const owner = await sourceImageAccount();
  const value = await backendRequest<{ images: Array<{ id: string; url: string }> }>('/api/v1/mistake-images/urls', 'POST', { sourceImageIds: ids }, owner);
  if (getActiveAccountId() !== owner) throw new Error('Tài khoản đã thay đổi. Hãy mở lại thẻ.');
  const prefix = `${import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')}/storage/v1/object/sign/mistake-sources/${owner}/`;
  if (!Array.isArray(value.images) || value.images.length !== ids.length || value.images.some((image, index) =>
    image.id !== ids[index] || !image.url.startsWith(`${prefix}${image.id}.jpg?`))) throw new Error('Liên kết ảnh nguồn chưa hợp lệ.');
  return value.images;
}
