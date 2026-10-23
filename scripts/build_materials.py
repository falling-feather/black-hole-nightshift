"""Build the illustrated explanation and edited showcase from real captures.

Current product facts live in doc/01; these are dated exhibition exports.
Requires ReportLab, Pillow and FFmpeg. No network or generated artwork.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "doc" / "image"
PUBLIC = ROOT / "public"
REGULAR = Path("C:/Windows/Fonts/msyh.ttc")
BOLD = Path("C:/Windows/Fonts/msyhbd.ttc")
W, H = A4
MARGIN = 44
WIDTH = W - MARGIN * 2
INK = colors.HexColor("#e2eee9")
MUTED = colors.HexColor("#94a9ad")
ACCENT = colors.HexColor("#99d7d4")
BACKGROUND = colors.HexColor("#080f16")


def build_pdf() -> Path:
    pdfmetrics.registerFont(TTFont("YaHei", str(REGULAR), subfontIndex=0))
    pdfmetrics.registerFont(TTFont("YaHeiBold", str(BOLD), subfontIndex=0))
    output = PUBLIC / "黑洞夜班-作品说明.pdf"
    c = canvas.Canvas(str(output), pagesize=A4, pageCompression=1)
    c.setTitle("黑洞夜班 · 迟到的光 | 作品说明")
    c.setAuthor("")
    c.setSubject("2026-10-22 实现说明；依据项目 doc/01 与实机自验")

    def text(value: str, x: float, top: float, size=11, color=INK, bold=False):
        c.setFillColor(color)
        c.setFont("YaHeiBold" if bold else "YaHei", size)
        c.drawString(x, H - top - size, value)

    def para(value: str, top: float, width=WIDTH, x=MARGIN, size=10.7,
             leading=18, color=INK) -> float:
        style = ParagraphStyle("body", fontName="YaHei", fontSize=size,
                               leading=leading, textColor=color, wordWrap="CJK")
        p = Paragraph(value, style)
        _, height = p.wrap(width, H)
        if top + height > H - 48:
            raise ValueError(f"Text exceeds page: {value[:36]}")
        p.drawOn(c, x, H - top - height)
        return top + height

    def picture(name: str, x: float, top: float, width: float) -> float:
        source = IMAGES / name
        with Image.open(source) as im:
            height = width * im.height / im.width
        c.drawImage(str(source), x, H - top - height, width, height, mask="auto")
        return top + height

    def page(number: int, label: str, title: str):
        c.setFillColor(BACKGROUND)
        c.rect(0, 0, W, H, fill=1, stroke=0)
        text("黑洞夜班 / LATE LIGHT", MARGIN, 30, 8, ACCENT)
        text(label, W - 182, 30, 8, MUTED)
        c.setStrokeColor(colors.HexColor("#284149"))
        c.setLineWidth(.5)
        c.line(MARGIN, H - 56, W - MARGIN, H - 56)
        text(title, MARGIN, 77, 26, INK, True)
        text("INTERACTIVE DIGITAL ART · 2026", MARGIN, H - 30, 7, MUTED)
        text(f"{number:02d} / 04", W - 82, H - 30, 7, ACCENT)

    page(1, "01 / THE IDEA", "迟到的光")
    text("同一个过去，不止一次到来。", MARGIN, 133, 21, ACCENT)
    para("在无法直视的黑暗面前，写下一句话，或留下一笔光。看它随吸积流延展、剪切，再沿不同的弯路抵达。你能改变观看的时刻，在别处重新遇见自己的痕迹。", 186, size=11, leading=20)
    end = picture("21-读信时刻.png", MARGIN, 273, WIDTH)
    text("实际运行画面 / 一句「愿你自由」进入盘面光场", MARGIN, end + 12, 8.5, MUTED)
    text("留给黑暗，一句话。", MARGIN, 657, 21)
    para("作品让观众亲自留下变化的原因，再辨认自己的过去如何抵达。轨道、引力弯折与时间差共同参与表达；个人的短句赋予这段观测一个具体的牵挂。", 704, size=11, leading=20)
    c.showPage()

    page(2, "02 / THE EXPERIENCE", "让观测，成为一次创作。")
    para("默认保留完整视野。跟随一束光的旅程随时可以跳过、退出或重来；重来保留所有笔迹。也可以直接环绕、绘画与调参。", 128)
    half = (WIDTH - 14) / 2
    end = picture("18-盘沿追光旅程.png", MARGIN, 188, half)
    picture("19-沿光路回看.png", MARGIN + half + 14, 188, half)
    text("在真实绕行像中发现另一份过去", MARGIN, end + 9, 8, MUTED)
    text("沿同一发光点的几何路径回看", MARGIN + half + 14, end + 9, 8, MUTED)
    top = 386
    steps = [
        ("01  留下", "按住盘面拖出连续光丝，或在光笔中输入最多八个可见字符。短句写成一笔光，先停在可读的俯瞰视角。"),
        ("02  等待", "让光继续，文字随轨道速度差拉开。旅程转向盘沿，在实际检测到清晰绕行像后停住观测。"),
        ("03  追溯", "点击亮处或「沿着它的路」，查看所选发光点的多条光路与传播时间。窄屏可在追光面板中直接重看。"),
        ("04  重逢", "回拨后再次接收同一笔光。接着换色再留一笔，或保存 PNG；「读信时刻」可回到短句的初始阅读位置。"),
    ]
    for heading, body in steps:
        text(heading, MARGIN, top, 12, ACCENT, True)
        para(body, top + 26, size=10.5, leading=17)
        top += 85
    para("H / 右键：面罩命令　2：光笔　3：追光　G：旅程　R：时序<br/>空格：暂停　方向键：微调　C：留帧　N：手记　Esc：关闭／退出", 735, size=9, leading=16, color=MUTED)
    c.showPage()

    page(3, "03 / HOW IT WORKS", "光路一致，过去才能重逢。")
    para("观众画下的痕迹、光路剖面、绕行像与时间回拨来自同一套演算。实时视野按当前观测时刻，读取各条光路携带的盘面状态。", 128)
    labels = ["盘面落笔", "材质光场", "各路发光时刻", "实际像素识别", "回拨再看"]
    node_width = (WIDTH - 4 * 16) / 5
    for i, label in enumerate(labels):
        x = MARGIN + i * (node_width + 16)
        text(label, x, 202, 9.3, ACCENT)
        c.setStrokeColor(colors.HexColor("#477079"))
        c.line(x, H - 227, x + node_width, H - 227)
        if i < 4:
            text(">", x + node_width + 3, 202, 9, MUTED)
    top = 262
    blocks = [
        ("01  共用的光路", "非旋转 Schwarzschild 黑洞的零测地线使用 RK4 数值积分、预计算与查表。盘面拾取、成像反求和近场剖面共享轨迹，运行时呈现最多四次盘面交点。"),
        ("02  会运动的笔迹", "光丝与本机字形都写入随圆轨道近似运动的盘面材质。覆盖率与峰值时刻共同保存，轨道速度差产生剪切；回拨仅改变观看时刻，支持重复重现。"),
        ("03  看见之后的反馈", "标记来自遮挡与透明度处理后的真实亮像素。检测帧带有时间、视角及材质版本，旅程据此推进；可选声场用相关音句回应落笔、发现与重逢。"),
    ]
    for heading, body in blocks:
        text(heading, MARGIN, top, 12, ACCENT, True)
        top = para(body, top + 28, size=10.5, leading=18) + 21
    image_width = 294
    end = picture("19-沿光路回看.png", MARGIN, 600, image_width)
    para("<b>科学与艺术边界</b><br/>非旋转黑洞与薄盘近似；红移、多普勒亮度与有限阶像均有限精度。未求解磁流体、Kerr 时空或黑洞内部。<br/><br/>谱色、显影、湍流纹理和声场服务于表达，不是实测光度或太空录音。", 605,
         width=WIDTH - image_width - 18, x=MARGIN + image_width + 18,
         size=8.9, leading=15, color=MUTED)
    c.showPage()

    page(4, "04 / EVIDENCE & USE", "可运行，也可核验。")
    para("以下为 2026-10-22 的本机实现自验。性能采样与录制速度分开记录；它们不代表独立观众评价或其他设备的表现。", 128)
    for x, value, label in [(MARGIN, "54", "规则测试全部通过"),
                            (MARGIN + 172, "48", "两笔场景 / 实测 FPS"),
                            (MARGIN + 344, "41", "32 笔 / 实测 FPS")]:
        text(value, x, 188, 34, ACCENT)
        text(label, x, 239, 9, MUTED)
    para("环境：本机 Chromium / Intel Arc / ANGLE D3D11，1440×900。两笔在 6.000 秒绘制 287 次；32 笔在 6.001 秒绘制 246 次，后者记录到一次 58 ms 页面长任务。两段 WebGL error=0。实际绘制帧数不等于 GPU 查询耗时。", 279, size=9.8, leading=17)
    top = 363
    for heading, body in [
        ("时间可重现", "读信时刻 34 → 36 → 34，返回 PNG 与原图逐字节一致，推进后的图像不同；原格式三份手记可重载。"),
        ("创作有边界", "32 笔不覆盖旧作品；整笔撤销／恢复及清空恢复通过。满容量仍可跟随已有光束完成观测。"),
        ("资源随创作使用", "局部 Mip 与完整重建逐值一致；增量上传与完整上传留帧一致。暂停停止绘制，清空后 GPU 层由 32 回收至 1。"),
        ("入口可以读懂", "桌面与 390×844 窄屏完成短句旅程。未覆盖真实手机、其他 GPU、长时间展陈或独立观众首次试玩。"),
    ]:
        text(heading, MARGIN, top, 10.2, ACCENT, True)
        end = para(body, top, width=WIDTH - 112, x=MARGIN + 112, size=9.7, leading=16)
        top = max(end, top + 36) + 17
    text("本地体验与创作来源", MARGIN, 641, 12, ACCENT, True)
    para("双击随作品提供的「启动黑洞夜班.cmd」，使用支持 WebGL 2 的现代桌面浏览器。声音默认关闭；刷新会清空可编辑笔迹，先用 C 留存 PNG。<br/>运行不使用远程素材、字体、图像或配乐。AI 协助资料研究、代码和界面草拟、调试及文档制作；用户提出方向与验收要求。参赛学生的具体贡献及答辩掌握情况需按实际完成内容另行确认。", 668, size=9.2, leading=16)
    para('研究依据：<link href="https://www.nasa.gov/universe/nasa-visualization-shows-a-black-holes-warped-world/" color="#99d7d4">NASA 黑洞可视化</link>　<link href="https://ebruneton.github.io/black_hole_shader/" color="#99d7d4">Bruneton 实时渲染研究</link>　<link href="https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices" color="#99d7d4">MDN WebGL 实践</link><br/>当前实现、来源与科学边界以随作品的 doc/01 为准；实际测试与展示来源见 doc/03。', 766, size=8, leading=13, color=MUTED)
    c.save()
    return output


def build_video(temp: Path, ffmpeg: Path) -> Path:
    if not temp.is_relative_to(ROOT / "node_modules" / ".vite") or not temp.is_dir():
        raise ValueError("Use an existing task-owned directory under node_modules/.vite")
    title_font = ImageFont.truetype(str(REGULAR), 37)
    small_font = ImageFont.truetype(str(REGULAR), 23)
    clips = [
        ("24-首次观测入口.png", 6, "同一个过去，不止一次到来。", "黑洞夜班 · 迟到的光 / 交互数字艺术", "实机界面留帧"),
        ("21-读信时刻.png", 7, "把一句话，写成光。", "短句进入盘面材质，先停在可以读清的时刻", "实机界面留帧"),
        ("video", 12.5, "你留下的，正在远行。", "轨道运动与速度差，让同一句话延展、剪切、消退", "实时画布实录 · 480×演化"),
        ("18-盘沿追光旅程.png", 9.5, "同一份过去，从别处抵达。", "实际成像像素触发发现与停时，再沿着光追溯", "实机界面留帧"),
        ("19-沿光路回看.png", 9, "沿着弯路，回到那一刻。", "剖面与实时画面共用测地线表，回拨保留同一个发光点", "实机界面留帧"),
        ("20-旅程完成.png", 9, "改变观看时刻，再次遇见自己的过去。", "旅程可以退出、重来；继续落笔，或留存这一刻", "实机界面留帧"),
        ("24-首次观测入口.png", 8, "你停下以后，光仍在抵达。", "本片为实机剪辑；配乐由作品同源程序声场生成", "黑洞夜班 · 迟到的光"),
    ]
    for i, (name, duration, title, subtitle, provenance) in enumerate(clips):
        footer = Image.new("RGB", (1920, 120), "#080f16")
        draw = ImageDraw.Draw(footer)
        draw.line([(96, 0), (1824, 0)], fill="#284149", width=1)
        draw.text((96, 15), title, font=title_font, fill="#e2eee9")
        draw.text((96, 75), subtitle, font=small_font, fill="#94a9ad")
        bbox = draw.textbbox((0, 0), provenance, font=small_font)
        draw.text((1824 - bbox[2], 24), provenance, font=small_font, fill="#99d7d4")
        footer_path = temp / f"footer-{i:02d}.png"
        footer.save(footer_path)
        source = ROOT / "doc/media/02-短句盘面演化实录.mp4" if name == "video" else IMAGES / name
        command = [str(ffmpeg), "-y", "-hide_banner", "-loglevel", "error"]
        if name != "video":
            command += ["-loop", "1"]
        command += ["-i", str(source), "-loop", "1", "-i", str(footer_path),
                    "-filter_complex", "[0:v]scale=1536:960:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:0:color=0x080f16,setsar=1[scene];[scene][1:v]overlay=0:960,format=yuv420p[out]",
                    "-map", "[out]", "-an", "-t", str(duration), "-r", "30",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "19", str(temp / f"segment-{i:02d}.mp4")]
        subprocess.run(command, check=True, cwd=ROOT)
    concat = temp / "showcase.ffconcat"
    concat.write_text("ffconcat version 1.0\n" + "".join(f"file 'segment-{i:02d}.mp4'\n" for i in range(len(clips))), encoding="utf-8")
    output = PUBLIC / "黑洞夜班-作品展示.mp4"
    subprocess.run([str(ffmpeg), "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "1", "-i", str(concat),
                    "-i", str(ROOT / "doc/media/03-同源程序声场.m4a"), "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", "-t", "61",
                    "-metadata", "title=黑洞夜班 · 迟到的光 / 实机剪辑", "-movflags", "+faststart", str(output)], check=True, cwd=ROOT)
    return output


def build_flow_recording(frame_dir: Path, ffmpeg: Path) -> Path:
    if not frame_dir.is_relative_to(ROOT / "node_modules" / ".vite"):
        raise ValueError("Use task-owned captured frames under node_modules/.vite")
    record = json.loads((frame_dir / "frames.json").read_text(encoding="utf-8"))
    frames = record["frames"]
    duration = record["ended"] - frames[0]["time"]
    lines = ["ffconcat version 1.0"]
    for i, frame in enumerate(frames):
        next_time = frames[i + 1]["time"] if i + 1 < len(frames) else record["ended"]
        if Path(frame["name"]).name != frame["name"] or not (frame_dir / frame["name"]).is_file():
            raise ValueError("Captured frame must be a local filename")
        lines += [f"file '{frame['name']}'", "option framerate 30", f"duration {next_time - frame['time']:.6f}"]
    lines += [f"file '{frames[-1]['name']}'", "option framerate 30"]
    concat = frame_dir / "flow.ffconcat"
    concat.write_text("\n".join(lines) + "\n", encoding="utf-8")
    footer = Image.new("RGB", (1920, 120), "#080f16")
    draw = ImageDraw.Draw(footer)
    draw.line([(96, 0), (1824, 0)], fill="#284149", width=1)
    draw.text((96, 15), "留下、等待、追溯、重逢", font=ImageFont.truetype(str(REGULAR), 37), fill="#e2eee9")
    draw.text((96, 75), "完整交互实录 / 按原时间顺序连续捕获 / 无剪切、无运动补帧 / 声场关闭", font=ImageFont.truetype(str(REGULAR), 23), fill="#94a9ad")
    footer_path = frame_dir / "footer.png"
    footer.save(footer_path)
    output = PUBLIC / "黑洞夜班-交互实录.mp4"
    subprocess.run([str(ffmpeg), "-y", "-hide_banner", "-loglevel", "warning", "-f", "concat", "-safe", "0", "-i", str(concat),
                    "-loop", "1", "-i", str(footer_path), "-filter_complex",
                    "[0:v]scale=1536:960:in_range=full:out_range=limited,pad=1920:1080:(ow-iw)/2:0:color=0x080f16,setsar=1[scene];[scene][1:v]overlay=0:960,format=yuv420p[out]",
                    "-map", "[out]", "-an", "-t", f"{duration+1/30:.6f}", "-r", "30", "-fps_mode", "cfr", "-color_range", "tv",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "19", "-movflags", "+faststart", str(output)], check=True, cwd=ROOT)
    print(f"continuous source: {len(frames)} frames / {duration:.3f} seconds")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--temp-dir", type=Path)
    parser.add_argument("--ffmpeg", type=Path)
    parser.add_argument("--flow-frames", type=Path)
    args = parser.parse_args()
    print(build_pdf())
    if args.temp_dir and args.ffmpeg:
        print(build_video(args.temp_dir.resolve(), args.ffmpeg.resolve()))
    if args.flow_frames and args.ffmpeg:
        print(build_flow_recording(args.flow_frames.resolve(), args.ffmpeg.resolve()))
