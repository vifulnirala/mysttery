#include <jni.h>
#include <cstdlib>
#include <string>
#include <unistd.h>
#include <node.h>

extern "C" JNIEXPORT jint JNICALL
Java_com_mysteryvault_android_MainActivity_startNode(
        JNIEnv* env, jobject /* thiz */, jstring project_dir, jstring cache_dir) {
    const char* project = env->GetStringUTFChars(project_dir, nullptr);
    const char* cache = env->GetStringUTFChars(cache_dir, nullptr);

    setenv("HOME", project, 1);
    setenv("TMPDIR", cache, 1);
    setenv("NODE_COMPILE_CACHE", (std::string(cache) + "/node-compile-cache").c_str(), 1);
    setenv("NODE_COMPILE_CACHE_PORTABLE", "1", 1);
    setenv("NODE_OPTIONS", "--max-old-space-size-percentage=35", 1);

    // server.js uses relative paths for dotenv and Express static assets.
    // Run it from its app-private backend directory without changing its source.
    if (chdir(project) != 0) {
        env->ReleaseStringUTFChars(project_dir, project);
        env->ReleaseStringUTFChars(cache_dir, cache);
        return 1;
    }

    const std::string entry = std::string(project) + "/server.js";
    env->ReleaseStringUTFChars(project_dir, project);
    env->ReleaseStringUTFChars(cache_dir, cache);

    char arg0[] = "node";
    std::string arg1_storage = entry;
    char* argv[] = {arg0, arg1_storage.data(), nullptr};
    return node::Start(2, argv);
}
