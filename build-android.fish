#!/usr/bin/env fish

# Build an Android APK locally and optionally send it to a KDE Connect device.

set -l target_device_id ""
set -l target_device_name ""
set -l project_dir (pwd)
set -l current_project (basename "$project_dir")

function send_notification --argument-names message
    if test -n "$target_device_id"
        kdeconnect-cli -d "$target_device_id" --ping-msg "$message"
    end
end

function choose_device
    if not type -q kdeconnect-cli
        echo "KDE Connect was not found. Building without device transfer."
        return
    end

    if not type -q fzf
        echo "fzf was not found. Building without device transfer."
        return
    end

    while true
        set -l raw_devices (kdeconnect-cli -l 2>/dev/null | string match -r '^- .*')
        set -l options

        for line in $raw_devices
            set -a options (string replace -r '^- ' '' -- "$line")
        end

        set -a options "Build without transfer" "Refresh device list"

        echo ""
        echo "Fetching available KDE Connect devices..."
        set -l selected (printf "%s\n" $options | fzf --height=10 --layout=reverse --header="Select a target (Arrow Keys + Enter)")

        if test -z "$selected"; or test "$selected" = "Build without transfer"
            return
        end

        if test "$selected" = "Refresh device list"
            continue
        end

        set -l device_line (string replace -r ' \(.*\)$' '' -- "$selected")
        set target_device_name (string replace -r ':.*$' '' -- "$device_line")
        set -l id_section (string replace -r '^[^:]+:\s*' '' -- "$device_line")
        set target_device_id (string replace -r '\s.*$' '' -- "$id_section")

        if test -n "$target_device_id"
            echo (set_color green)"Target set to: $target_device_name"(set_color normal)
            return
        end

        echo (set_color yellow)"Could not read that device ID. Try refreshing the list."(set_color normal)
    end
end

if not type -q eas
    echo (set_color red)"EAS CLI was not found. Install it, then run this script again."(set_color normal)
    exit 1
end

choose_device

if not set -q JAVA_HOME; and test -d "$HOME/.sdkman/candidates/java/current"
    set -lx JAVA_HOME "$HOME/.sdkman/candidates/java/current"
end

if test -n "$JAVA_HOME"
    set -lx PATH "$JAVA_HOME/bin" $PATH
end

if not set -q ANDROID_HOME
    set -lx ANDROID_HOME "$HOME/Android/Sdk"
end

if test -d "$ANDROID_HOME/cmdline-tools/latest/bin"
    set -lx PATH "$ANDROID_HOME/cmdline-tools/latest/bin" $PATH
end

if test -d "$ANDROID_HOME/platform-tools"
    set -lx PATH "$ANDROID_HOME/platform-tools" $PATH
end

set -l output_dir "$project_dir/dist"
set -l timestamp (date "+%Y%m%d-%H%M%S")
set -l build_file "$output_dir/$current_project-$timestamp.apk"
mkdir -p "$output_dir"

send_notification "Build started for $current_project"
echo ""
echo (set_color cyan)"Starting local Android production build..."(set_color normal)
echo "Output: $build_file"
echo ""

eas build --platform android --profile production --local --output "$build_file"
set -l build_status $status

if test $build_status -ne 0
    echo (set_color red)"Build failed. Check the terminal output above."(set_color normal)
    send_notification "Build failed for $current_project. Check the terminal logs."
    exit $build_status
end

echo (set_color green)"Build completed: $build_file"(set_color normal)

if test -n "$target_device_id"
    echo "Sending APK to $target_device_name..."
    if kdeconnect-cli -d "$target_device_id" --share "$build_file"
        send_notification "Build finished. $current_project APK was sent successfully."
    else
        echo (set_color yellow)"The APK was built, but the transfer failed."(set_color normal)
        send_notification "Build finished, but the APK transfer failed."
    end
end
