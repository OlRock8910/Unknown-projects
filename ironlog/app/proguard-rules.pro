# kotlinx.serialization: keep the generated serializers for the app's data classes.
# (The library ships general rules; these pin down our own model.)
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keep,includedescriptorclasses class com.ironlog.**$$serializer { *; }
-keepclassmembers class com.ironlog.** {
    *** Companion;
}
-keepclasseswithmembers class com.ironlog.** {
    kotlinx.serialization.KSerializer serializer(...);
}
