import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), request: vi.fn(), active: vi.fn() }));
vi.mock('@/shared/api/api', () => ({ backendRequest: mocks.request }));
vi.mock('@/shared/api/supabaseClient', () => ({ cloud: { auth: { getSession: mocks.getSession } } }));
vi.mock('@/shared/data/dataBundle', () => ({ getActiveAccountId: mocks.active }));
import { sourceImageAccount, sourceImageUrls, uploadSourceImages } from './sourceImages';

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('VITE_SUPABASE_URL', 'https://database.example');
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'owner', is_anonymous: false } } } });
  mocks.active.mockReturnValue('owner');
});
afterEach(() => vi.unstubAllEnvs());

it('uploads images without storing local names or transmitting image bytes with the synced card', async () => {
  const ids = ['a'.repeat(64)]; mocks.request.mockResolvedValue({ sourceImageIds: ids });
  expect(await uploadSourceImages([{ id: 'local', name: 'private-name.png', dataUrl: 'data:image/jpeg;base64,example' }])).toEqual(ids);
  expect(mocks.request).toHaveBeenCalledWith('/api/v1/mistake-images', 'POST', { images: [{ dataUrl: 'data:image/jpeg;base64,example' }] }, 'owner');
});

it('rejects guests and accounts that are not the active data owner before making a request', async () => {
  mocks.active.mockReturnValue('other');
  await expect(sourceImageAccount()).rejects.toThrow('Đăng nhập Google');
  mocks.active.mockReturnValue('owner');
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'owner', is_anonymous: true } } } });
  await expect(uploadSourceImages([])).rejects.toThrow('Đăng nhập Google');
  expect(mocks.request).not.toHaveBeenCalled();
});

it('rejects delayed responses from a previous account and foreign/unsafe URLs', async () => {
  const ids = ['a'.repeat(64)];
  mocks.request.mockImplementation(async () => { mocks.active.mockReturnValue('other'); return { sourceImageIds: ids }; });
  await expect(uploadSourceImages([{ id: '', name: '', dataUrl: 'data:image/jpeg;base64,example' }])).rejects.toThrow('Tài khoản đã thay đổi');
  mocks.active.mockReturnValue('owner');
  mocks.request.mockResolvedValue({ images: [{ id: ids[0], url: `https://database.example/storage/v1/object/sign/mistake-sources/other/${ids[0]}.jpg?token=abc` }] });
  await expect(sourceImageUrls(ids)).rejects.toThrow('Liên kết ảnh nguồn chưa hợp lệ');
  mocks.request.mockResolvedValue({ images: [{ id: ids[0], url: `https://database.example/storage/v1/object/sign/mistake-sources/owner/${ids[0]}.jpg?token=abc` }] });
  expect((await sourceImageUrls(ids))[0].id).toBe(ids[0]);
});
