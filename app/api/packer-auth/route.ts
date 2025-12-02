import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const password = body?.password;
    const secret = process.env.DOCKER_PACKER_PASSWORD;

    if (!secret) {
      return NextResponse.json({ error: '密码未在服务器上配置 (请设置 DOCKER_PACKER_PASSWORD 环境变量)' }, { status: 500 });
    }

    if (typeof password !== 'string') {
      return NextResponse.json({ ok: false, error: '无效的请求' }, { status: 400 });
    }

    if (password === secret) {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false }, { status: 401 });
  } catch (e) {
    return NextResponse.json({ error: '解析请求失败' }, { status: 400 });
  }
}
