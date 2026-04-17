#!/usr/bin/env python3
"""
Post-process demo video: generate TTS narration and merge with video.

Usage:
  /tmp/tts-venv/bin/python3 demo-add-narration.py

Reads:  screenshots/narration-markers.json + screenshots/demo-upload-analysis.webm
Output: screenshots/demo-upload-analysis-narrated.mp4
"""

import asyncio
import json
import os
import subprocess
import sys

VOICE = "en-US-AndrewNeural"
RATE = "+0%"
SCREENSHOTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
MARKERS_FILE = os.path.join(SCREENSHOTS_DIR, "narration-markers.json")
VIDEO_INPUT = os.path.join(SCREENSHOTS_DIR, "demo-upload-analysis.webm")
VIDEO_OUTPUT = os.path.join(SCREENSHOTS_DIR, "demo-upload-analysis-narrated.mp4")
AUDIO_DIR = os.path.join(SCREENSHOTS_DIR, "narration-audio")


async def generate_audio_segment(text, output_path, voice=VOICE, rate=RATE):
    """Generate a single TTS audio file using edge-tts."""
    import edge_tts
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    await communicate.save(output_path)


async def generate_all_audio(markers):
    """Generate TTS audio for all narration segments."""
    os.makedirs(AUDIO_DIR, exist_ok=True)

    for i, marker in enumerate(markers):
        output_path = os.path.join(AUDIO_DIR, f"segment-{i:02d}.mp3")
        marker["audio_file"] = output_path
        if os.path.exists(output_path):
            print(f"  [{i:02d}] Cached: {marker['subtitle'][:50]}")
            continue
        print(f"  [{i:02d}] Generating: {marker['subtitle'][:50]}...")
        await generate_audio_segment(marker["narration"], output_path)
        dur = get_audio_duration(output_path)
        print(f"  [{i:02d}] Done ({dur:.1f}s)")

    return markers


def get_audio_duration(filepath):
    """Get audio file duration in seconds."""
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "csv=p=0", filepath],
        capture_output=True, text=True
    )
    return float(result.stdout.strip()) if result.stdout.strip() else 0


def merge_audio_with_video(markers):
    """Use ffmpeg to merge all narration audio segments with the video."""
    print("\nMerging audio with video...")

    inputs = ["-i", VIDEO_INPUT]
    filter_parts = []
    audio_labels = []

    for i, marker in enumerate(markers):
        audio_file = marker["audio_file"]
        if not os.path.exists(audio_file):
            continue

        delay_ms = int(marker["time"] * 1000)
        inputs.extend(["-i", audio_file])
        input_idx = i + 1  # 0 is video

        label = f"a{i}"
        filter_parts.append(f"[{input_idx}:a]adelay={delay_ms}|{delay_ms}[{label}]")
        audio_labels.append(f"[{label}]")

    if not audio_labels:
        print("No audio segments to merge!")
        return

    # Mix all delayed audio streams
    mix_inputs = "".join(audio_labels)
    filter_parts.append(f"{mix_inputs}amix=inputs={len(audio_labels)}:normalize=0[narration]")

    filter_complex = ";".join(filter_parts)

    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", "0:v",
        "-map", "[narration]",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        VIDEO_OUTPUT,
    ]

    print(f"Running ffmpeg with {len(audio_labels)} audio segments...")
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print("ffmpeg FAILED:")
        print(result.stderr[-1000:] if len(result.stderr) > 1000 else result.stderr)
        sys.exit(1)

    output_size = os.path.getsize(VIDEO_OUTPUT) / (1024 * 1024)
    print(f"\nOutput: {VIDEO_OUTPUT} ({output_size:.1f} MB)")


async def main():
    if not os.path.exists(MARKERS_FILE):
        print(f"Error: {MARKERS_FILE} not found.")
        print("Run 'node demo-record.cjs' first to generate the video and markers.")
        sys.exit(1)

    with open(MARKERS_FILE) as f:
        markers = json.load(f)

    print(f"Loaded {len(markers)} narration segments.\n")

    for i, m in enumerate(markers):
        print(f"  {m['time']:6.1f}s  {m['subtitle']}")

    print(f"\nGenerating TTS audio (voice: {VOICE})...")
    markers = await generate_all_audio(markers)

    print("\nSegment timeline:")
    for i, m in enumerate(markers):
        dur = get_audio_duration(m["audio_file"])
        print(f"  [{i:02d}] {m['time']:6.1f}s + {dur:.1f}s narration")

    merge_audio_with_video(markers)
    print("Done!")


if __name__ == "__main__":
    asyncio.run(main())
