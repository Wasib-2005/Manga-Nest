#!/usr/bin/env fish

set -l target_device_id ""
set -l target_device_name ""

# 1. Device Selection via Arrow Keys (fzf)
while true
    set -l raw_devices (kdeconnect-cli -l 2>/dev/null | grep "^- ")
    set -l fzf_options

    # Format connected devices for the menu
    for line in $raw_devices
        set -l clean_line (string replace -r '^- ' '' -- $line)
        set -a fzf_options $clean_line
    end

    # Append control options to the list
    set -a fzf_options "Refresh list"
    set -a fzf_options "Cancel transfer (Build only)"

    # Run fzf with arrow keys enabled
    echo ""
    echo "Fetching active KDE Connect devices..."
    set -l selected (printf "%s\n" $fzf_options | fzf --height=10 --layout=reverse --header="Select a target (Use Arrow Keys + Enter):")

    # Handle user selection or ESC/Cancel
    if test -z "$selected"; or string match -q "*Cancel transfer*" -- "$selected"
        echo "Proceeding with build only."
        break
    else if string match -q "*Refresh list*" -- "$selected"
        echo "Refreshing..."
        continue
    else
        # Extract name before the colon
        set -l clean_selection (string replace -r ' \(.*\)$' '' -- $selected)
        set -l parts (string split ": " -- $clean_selection)
        set target_device_name $parts[1]

        # Isolate ONLY the hex UUID (stripping ' on 10.x.x.x via LAN')
        set target_device_id (string replace -r ' .*' '' -- $parts[2])

        echo (set_color green)"Target set to: $target_device_name ($target_device_id)"(set_color normal)
        break
    end
end

set -l current_project (basename $PWD)

# 2. Before Build Notification
if test -n "$target_device_id"
    kdeconnect-cli -d $target_device_id --ping-msg "Build started for $current_project!"
end

echo ""
echo (set_color cyan)"Starting local EAS production build..."(set_color normal)
echo ""

# 3. Environment & EAS Build Execution
set -x JAVA_HOME /home/waslla/.sdkman/candidates/java/17.0.10-tem
set -x PATH $JAVA_HOME/bin $PATH

set -x ANDROID_HOME $HOME/Android/Sdk
set -x ANDROID_NDK_HOME $ANDROID_HOME/ndk/27.1.12297006
set -Ua fish_user_paths $ANDROID_HOME/cmdline-tools/latest/bin $ANDROID_HOME/platform-tools $ANDROID_NDK_HOME

set -x NODE_ENV production

eas build --platform android --profile production --local
set -l build_status $status

# 4. After Build Handling
if test $build_status -ne 0
    echo (set_color red)"Build failed!"(set_color normal)
    if test -n "$target_device_id"
        kdeconnect-cli -d $target_device_id --ping-msg "❌ Build failed for $current_project. Check terminal logs."
    end
    exit 1
end

echo (set_color green)"Build completed successfully!"(set_color normal)

if test -n "$target_device_id"
    # Find the newest generated build file (.apk or .aab)
    set -l build_file (ls -t *.{apk,aab} 2>/dev/null | head -n 1)

    if test -n "$build_file"
        echo "Sending $build_file to $target_device_name..."
        kdeconnect-cli -d $target_device_id --share $build_file
        kdeconnect-cli -d $target_device_id --ping-msg "Build finished! $build_file sent successfully."
    else
        echo (set_color yellow)"Could not locate the generated build file (.apk or .aab) dynamically."(set_color normal)
        kdeconnect-cli -d $target_device_id --ping-msg "Build finished, but couldn't locate the file to transfer."
    end
end
